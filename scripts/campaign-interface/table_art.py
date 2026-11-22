"""Use the same manifest as a started table. Subject keys are scoped to each party edition."""
from sources import ROOT, read


def table_art(slug):
    figures, grounds, references = {}, {}, {}
    library = ROOT / 'fixtures/campaign-library' / slug / 'library.json'
    if library.is_file():
        shelf = read(library)
        for row in shelf['pictures']:
            target = ROOT / row['source']
            keys = {key for edition in row['subjects'].values() for key in edition}
            bucket = figures if row['purpose'] == 'figure' else grounds if row['purpose'] == 'battle-map' else references
            if bucket is references and row['variant'] != 'reference':
                continue
            for key in keys:
                bucket.setdefault(key, target)
        return dict(figures=figures, grounds=grounds, references=references, atlas=references['world-map'],
                    editions={v['label']: library.parent / v['file'] for v in shelf['variants']})
    folders = [ROOT / 'fixtures' / 'ravenford-ru' / 'assets']
    if slug == 'hollowmere':
        folders.insert(0, ROOT / 'fixtures' / 'hollowmere' / 'assets')
    for folder in folders:
        for row in read(folder / 'manifest.json')['assets']:
            bucket = figures if row['purpose'] == 'figure' else grounds if row['purpose'] == 'battle-map' else references
            if bucket is references and row['variant'] != 'reference':
                continue
            for key in row['entityIds']:
                bucket.setdefault(key, folder / row['file'])
    if slug == 'hollowmere':
        active = {e['locationId'] for e in read(ROOT/'fixtures/hollowmere-ru/encounters.json')['encounters']}
        grounds = {key: value for key, value in grounds.items() if key in active}
    return dict(figures=figures, grounds=grounds, references=references,
                atlas=references['ravenford-surroundings' if slug == 'ravenford' else 'fenlands'], editions={})
