"""GenCG .gcg -> JSON  {title, slides: ["line1\nline2", ...]}
usage: python3 gcg_parse.py <input.gcg or folder> <output.json> [--dedupe]"""
import sys, struct, json, os

def extract_blocks(d):
    blocks=[]; i=0; n=len(d)
    while i < n-10:
        j=i; chars=[]
        while j+10<=n and d[j+2:j+6]==b'\0\0\0\0' and d[j+6:j+10]==b'\1\0\0\0' and d[j:j+2]!=b'\0\0':
            chars.append(struct.unpack('<H',d[j:j+2])[0]); j+=10
        if len(chars)>=3:
            txt=''.join('\n' if c==13 else chr(c) for c in chars).strip('\n')
            blocks.append(txt); i=j
        else: i+=1
    return blocks

def parse_file(path, dedupe=False):
    blocks=extract_blocks(open(path,'rb').read())
    if dedupe:  # optional: drop consecutive identical blocks
        blocks=[b for k,b in enumerate(blocks) if k==0 or b!=blocks[k-1]]
    title=os.path.splitext(os.path.basename(path))[0]
    return {'title':title,'slides':blocks}

if __name__=='__main__':
    src,out=sys.argv[1],sys.argv[2]; keep='--dedupe' in sys.argv
    files=[os.path.join(src,f) for f in sorted(os.listdir(src)) if f.lower().endswith('.gcg')] if os.path.isdir(src) else [src]
    songs=[parse_file(f,keep) for f in files]
    json.dump(songs,open(out,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
    for s in songs: print(s['title'],'-',len(s['slides']),'slides')
