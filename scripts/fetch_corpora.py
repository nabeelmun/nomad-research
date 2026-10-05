"""Explicitly download the pinned original corpora; never called during research."""
import argparse
from pathlib import Path
import os
import requests
from build_corpus import ORIGINS, sha256
FILES = {'voyage': ('voyage.db',328810496), 'wiki':('wiki_core.db',223997952)}
def fetch(corpus, directory):
    filename, size = FILES[corpus]; digest = ORIGINS[corpus][0]
    directory.mkdir(parents=True,exist_ok=True); target = directory / filename
    if target.exists() and target.stat().st_size == size and sha256(target) == digest:
        print(filename + ': already verified',flush=True); return
    stage = target.with_name(target.name + '.part'); written = 0
    url = 'https://github.com/nabeelmun/nomad-research/releases/download/v1.1.0/' + filename
    try:
        with requests.get(url,stream=True,timeout=(30,90)) as response:
            response.raise_for_status()
            with stage.open('wb') as file:
                for block in response.iter_content(1024 * 1024):
                    if not block: continue
                    file.write(block); written += len(block)
                    if written > size: raise ValueError('Response exceeds pinned size')
                    if written % (64 * 1024 * 1024) == 0: print(filename + ': ' + str(written // 1048576) + ' MiB',flush=True)
        if written != size or sha256(stage) != digest: raise ValueError('Asset size / SHA-256 mismatch')
        os.replace(stage,target); print(filename + ': verified',flush=True)
    except BaseException:
        stage.unlink(missing_ok=True); raise
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus',choices=FILES)
    parser.add_argument('--output-dir',type=Path,default=Path('release/raw'))
    args = parser.parse_args()
    for corpus in [args.corpus] if args.corpus else FILES: fetch(corpus,args.output_dir)
