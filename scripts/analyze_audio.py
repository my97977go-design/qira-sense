"""Generate revisable acoustic candidates, never verified performance-technique labels.

Requires Python 3, numpy, scipy, matplotlib. Input is the supplied recording.
Usage: python3 scripts/analyze_audio.py /path/to/input.wav /path/to/output
"""
from pathlib import Path
import argparse, hashlib, json, shutil, wave
import numpy as np
from scipy import signal, ndimage
from scipy.io import wavfile
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def pitch_yin(frame, sr):
    x = frame - np.mean(frame)
    rms = float(np.sqrt(np.mean(x*x)))
    if rms < 0.0015:
        return np.nan, 0.
    n = len(x)
    # FFT autocorrelation and exact overlap energies implement a YIN-style difference.
    fft = np.fft.rfft(x, 2*n)
    ac = np.fft.irfft(fft*np.conj(fft), 2*n)[:n]
    energy = np.concatenate(([0.], np.cumsum(x*x)))
    max_tau = min(n//2, int(sr/90))
    taus = np.arange(1, max_tau+1)
    diff = np.maximum(0., energy[n-taus]+energy[n]-energy[taus]-2*ac[taus])
    cmnd = np.ones(max_tau+1)
    cmnd[1:] = diff*taus / np.maximum(np.cumsum(diff), 1e-12)
    minimum = max(2, int(sr/3000))
    for t in range(minimum, max_tau):
        if cmnd[t] < 0.15:
            while t+1 < max_tau and cmnd[t+1] < cmnd[t]:
                t += 1
            den = cmnd[t-1]+cmnd[t+1]-2*cmnd[t]
            shift = np.clip((cmnd[t-1]-cmnd[t+1])/(2*den), -.5, .5) if den else 0
            return float(sr/(t+shift)), float(1-cmnd[t])
    return np.nan, float(max(0, 1-np.min(cmnd[minimum:])))


def robust_scale(xs):
    return xs / max(float(np.quantile(xs, .95)), 1e-8)


def compute(path):
    sr, raw = wavfile.read(path)
    if np.issubdtype(raw.dtype, np.integer):
        raw = raw.astype(np.float64) / max(abs(np.iinfo(raw.dtype).min), np.iinfo(raw.dtype).max)
    else:
        raw = raw.astype(np.float64)
    mono = np.mean(raw, axis=1) if raw.ndim > 1 else raw
    duration = len(mono)/sr
    rate = 22050
    from math import gcd
    div = gcd(sr, rate)
    x = signal.resample_poly(mono, rate//div, sr//div)
    size, hop = 2048, 220
    frames = np.lib.stride_tricks.sliding_window_view(x, size)[::hop].copy()
    times = (np.arange(len(frames))*hop+size/2)/rate
    rms = np.sqrt(np.mean(frames*frames, axis=1))
    spec = np.abs(np.fft.rfft((frames-frames.mean(axis=1, keepdims=True))*np.hanning(size), axis=1))
    bins = np.fft.rfftfreq(size, 1/rate)
    centroid = (spec*bins).sum(axis=1)/np.maximum(spec.sum(axis=1), 1e-8)
    pitch_conf = np.array([pitch_yin(frame, rate) for frame in frames])
    f0, periodicity = pitch_conf[:, 0], pitch_conf[:, 1]
    voiced = np.isfinite(f0) & (periodicity >= .85) & (rms > max(.0015, np.max(rms)*.035))
    f0[~voiced] = np.nan
    cents = 1200*np.log2(np.where(voiced, f0, np.nan)/440)
    # Isolated register jumps are unreliable estimates, not visually invented glides.
    centre = ndimage.median_filter(np.where(voiced, cents, np.nanmedian(cents)), size=15)
    outliers = voiced & (np.abs(cents-centre)>850)
    voiced[outliers] = False
    f0[~voiced] = np.nan
    cents[~voiced] = np.nan
    # Do not interpolate gaps for the displayed or exported pitch track.
    smooth = np.full_like(cents,np.nan)
    for begin, end in contiguous(voiced):
        smooth[begin:end] = ndimage.median_filter(cents[begin:end], size=3, mode='nearest')
    logspec = np.log1p(spec*12)
    flux = np.r_[0, np.mean(np.maximum(0, np.diff(logspec[:, (bins>=100)&(bins<=8000)], axis=0)), axis=1)]
    rise = np.r_[0, np.maximum(0, np.diff(rms))]
    novelty = ndimage.gaussian_filter1d(.75*robust_scale(flux)+.25*robust_scale(rise), 1)
    floor = ndimage.median_filter(novelty, size=101)
    prominence = novelty-floor
    peaks, props = signal.find_peaks(prominence, distance=round(.24/(hop/rate)), prominence=.09, height=.05)
    peaks = np.array([p for p in peaks if times[p]>.12 and times[p]<duration-.25 and rms[p]>.01], dtype=int)
    return dict(sr=sr, rate=rate, duration=duration, mono=mono, times=times, rms=rms,
                centroid=centroid, f0=f0, periodicity=periodicity, cents=smooth, voiced=voiced,
                novelty=novelty, onset_indices=peaks, step=hop/rate)


def contiguous(mask):
    edges = np.diff(np.r_[False, mask, False].astype(int))
    return list(zip(np.flatnonzero(edges==1), np.flatnonzero(edges==-1)))


def segment_candidates(a):
    t, cents, voiced = a['times'], a['cents'], a['voiced']
    step = a['step']
    candidates = []
    # Candidate glides require a voiced, gradual and mostly unidirectional movement.
    for width in [.18, .28, .4, .55]:
        n = round(width/step)
        for i in range(0, len(t)-n, 4):
            j = i+n
            ys = cents[i:j]
            if np.mean(voiced[i:j]) < .94 or not np.all(np.isfinite(ys)):
                continue
            delta = float(np.median(ys[-3:])-np.median(ys[:3]))
            if abs(delta) < 140:
                continue
            diffs = np.diff(ys)
            if np.max(np.abs(diffs)) > 100:
                continue
            variation = float(np.sum(np.abs(diffs)))
            if variation < 1 or abs(delta)/variation < .68:
                continue
            candidates.append(dict(kind='up-glide' if delta>0 else 'down-glide',
                start=float(t[i]), end=float(t[j-1]),
                score=min(1, abs(delta)/600)*.45+min(1, abs(delta)/variation)*.55,
                evidence={'pitchChangeCents':round(delta,1),'directionalConsistency':round(abs(delta)/variation,3),
                          'voicedRatio':round(float(np.mean(voiced[i:j])),3),
                          'maxFrameChangeCents':round(float(np.max(np.abs(diffs))),1)}))
    # Repeated pitch motion is compatible with several techniques. It is not proof of rouxian.
    n = round(1.0/step)
    for i in range(0, len(t)-n, 12):
        j=i+n
        if np.mean(voiced[i:j]) < .94:
            continue
        y=cents[i:j]
        if not np.all(np.isfinite(y)) or np.max(np.abs(np.diff(y))) > 140:
            continue
        detrended=signal.detrend(y)
        spectrum=np.abs(np.fft.rfft(detrended*np.hanning(n)))**2
        frequencies=np.fft.rfftfreq(n, step)
        band=(frequencies>=3.5)&(frequencies<=9)
        ratio=float(np.sum(spectrum[band])/max(np.sum(spectrum[frequencies>=1.5]),1e-8))
        excursion=float(np.quantile(detrended,.9)-np.quantile(detrended,.1))
        drift=float(np.median(y[-10:])-np.median(y[:10]))
        if ratio>.45 and 20<excursion<220 and abs(drift)<170:
            rate=float(frequencies[band][np.argmax(spectrum[band])])
            candidates.append(dict(kind='pitch-oscillation',start=float(t[i]),end=float(t[j-1]),
                score=ratio,evidence={'oscillationRateHz':round(rate,2),'rangeCents':round(excursion,1),
                                     'bandEnergyRatio':round(ratio,3),'driftCents':round(drift,1)}))
    # Keep distinct windows. A stronger candidate can suppress only nearby same-kind ones.
    chosen=[]
    for item in sorted(candidates,key=lambda c:c['score'],reverse=True):
        if any(item['kind']==old['kind'] and min(item['end'],old['end'])-max(item['start'],old['start'])>-.2 for old in chosen):
            continue
        chosen.append(item)
    return sorted(chosen,key=lambda c:c['start'])


def export_initial(a, candidates, source, output):
    output.mkdir(parents=True,exist_ok=True)
    (output/'audio').mkdir(exist_ok=True)
    if source.resolve() != (output/'audio'/'daqiban.wav').resolve():
        shutil.copyfile(source, output/'audio'/'daqiban.wav')
    def nullable(value):
        return round(float(value),4) if np.isfinite(value) else None
    frames=[{'time':round(float(t),4),'pitch':nullable(f),'periodicity':round(float(c),3),
             'rms':round(float(r),5),'centroid':round(float(s),1)}
            for t,f,c,r,s in zip(a['times'][::2],a['f0'][::2],a['periodicity'][::2],a['rms'][::2],a['centroid'][::2])]
    features={'schemaVersion':1,'method':'local acoustic analysis; no trained technique classifier',
              'timeReference':'seconds from exact uploaded recording start','duration':a['duration'],
              'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
              'analysisRate':a['rate'],'frameSize':2048,'hopSize':220,
              'exportStepSeconds':round(a['step']*2,6),
              'pitchRangeHz':[90,3000], 'periodicityNote':'algorithmic periodicity, NOT technique confidence or calibrated probability',
              'frames':frames}
    (output/'features.json').write_text(json.dumps(features,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    raw={'duration':a['duration'],'sourceSha256':features['sourceSha256'],'voicedRatio':float(np.mean(a['voiced'])),
         'pitchQuantilesHz':[float(x) for x in np.nanquantile(a['f0'],[.1,.5,.9])],
         'onsets':[{'time':round(float(a['times'][i]),3),'strength':round(float(a['novelty'][i]),3)} for i in a['onset_indices']],
         'candidates':candidates}
    (output/'analysis-candidates.json').write_text(json.dumps(raw,ensure_ascii=False,indent=2),encoding='utf8')
    fig, axes=plt.subplots(4,1,figsize=(16,11),layout='constrained')
    fig.patch.set_facecolor('#0f1515')
    colors={'up-glide':'#dcc08b','down-glide':'#89bccc','pitch-oscillation':'#bcace1'}
    for k, ax in enumerate(axes):
        ax.set_facecolor('#151d1d'); ax.tick_params(colors='#bec6bb'); ax.grid(alpha=.12,color='#bfcabf')
        for sp in ax.spines.values():sp.set_color('#44504a')
        start, end=k*10,min((k+1)*10,a['duration'])
        ax.set_xlim(start,end);ax.set_ylim(-2400,2100)
        ax.plot(a['times'],1200*np.log2(a['f0']/440),color='#e6d5ad',linewidth=.7)
        ax.set_ylabel('Pitch, cents / 440 Hz',color='#c7cabe')
        ax.set_xlabel('Recording time (seconds)',color='#c7cabe')
        for index,c in enumerate(candidates):
            if c['start']<end and c['end']>start:
                ax.axvspan(c['start'],c['end'],color=colors[c['kind']],alpha=.18)
                ax.text((c['start']+c['end'])/2,1800-(index%3)*270,str(index+1),color=colors[c['kind']],fontsize=8,ha='center')
        ax.scatter(a['times'][a['onset_indices']],np.full(len(a['onset_indices']),-2130),s=12,color='#df8c73')
    fig.suptitle('DAQIBAN — acoustic candidates, not verified techniques\nGold: up / Blue: down / Violet: oscillation / Coral: onset candidates',color='#f0e4c9',fontsize=15)
    fig.savefig(output/'analysis-overview.png',dpi=150,facecolor=fig.get_facecolor())
    print(json.dumps({k:v for k,v in raw.items() if k!='candidates'},ensure_ascii=False,indent=2))
    print('candidates',len(candidates))
    for i,c in enumerate(candidates):print(i+1,round(c['start'],3),round(c['end'],3),c['kind'],c['evidence'])


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('audio');parser.add_argument('output')
    args=parser.parse_args()
    source=Path(args.audio);output=Path(args.output)
    a=compute(source); candidates=segment_candidates(a)
    export_initial(a,candidates,source,output)
