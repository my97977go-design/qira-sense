"""Download open-license Google Fonts as small, self-hosted character subsets."""
from pathlib import Path
import hashlib
import re
import urllib.parse
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
files=[p for p in (ROOT/'src').rglob('*') if p.suffix in ('.jsx','.js','.json') and p.name!='features.json']
text=''.join(p.read_text(encoding='utf-8') for p in files)
chinese=''.join(sorted(set(re.findall(r'[\u3000-\u9fff\uff00-\uffef]',text))))
latin=''.join(chr(i) for i in range(32,127))+'½×∞↗↘—·'
destination=ROOT/'public/fonts'
destination.mkdir(exist_ok=True)
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'})
    return urllib.request.urlopen(req,timeout=40).read()
css=[]
for family,alias,weights,chars,directory in [('Noto Serif SC','Qira Serif','500',chinese,'notoserifsc'),('Noto Sans SC','Qira Sans','400;500;600',chinese,'notosanssc'),('Manrope','Qira Latin','400;500;600',latin,'manrope')]:
    query=urllib.parse.urlencode({'family':family+':wght@'+weights,'display':'swap','text':chars})
    style=get('https://fonts.googleapis.com/css2?'+query).decode()
    style=style.replace("'"+family+"'","'"+alias+"'")
    for url in set(re.findall(r'url\(([^)]+)\)',style)):
        data=get(url)
        ext='woff2' if data[:4]==b'wOF2' else 'woff' if data[:4]==b'wOFF' else 'ttf'
        name=directory+'-'+hashlib.sha256(data).hexdigest()[:10]+'.'+ext
        (destination/name).write_bytes(data)
        style=style.replace(url,'/fonts/'+name)
        print(name,len(data))
    css.append(style)
    (destination/(directory+'-OFL.txt')).write_bytes(get('https://raw.githubusercontent.com/google/fonts/main/ofl/'+directory+'/OFL.txt'))
(ROOT/'src/fonts.css').write_text('\n'.join(css),encoding='utf-8')
print('Bundled',len(chinese),'Chinese glyphs; no runtime font CDN required.')
