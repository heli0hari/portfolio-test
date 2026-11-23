/* =========================================================
   Project journal — per-project art direction.
   The content stays in projects.json; this only says how to present it.

   theme    system | human | data | material | visual   (see journal.css)
   cover    inset  (title over a framed image)
            split  (title beside the image)
            bleed  (image runs edge to edge under the title)
   chapters [{ at: <block index in projects.json content>, label: <short chapter name> }]
            A chapter starts at that block. If the block is a heading it
            becomes the chapter title. Labels name what the section is;
            only sections the content actually supports are used.
   facts    extra cover facts taken from the content (e.g. WealthX's table)
   skip     block indices already shown on the cover
   ========================================================= */
window.JOURNAL = {
  'wealthx': {
    theme: 'visual', cover: 'bleed',
    facts: { Role: 'Product & Brand Design', Platform: 'iOS · Web' },   // from the project's own table (block 1)
    skip: [1],
    chapters: [{ at: 2, label: 'Outcome' }]
  },
  'infrared-camera': {
    theme: 'system', cover: 'inset',
    chapters: [
      { at: 1, label: 'Overview' },
      { at: 5, label: 'First results' },
      { at: 10, label: 'Hardware' },
      { at: 22, label: 'Software' },
      { at: 26, label: 'Interface' },
      { at: 35, label: 'Reflection' }
    ]
  },
  'city-beneaththesurface': {
    theme: 'data', cover: 'split',
    chapters: [
      { at: 1, label: 'Overview' },
      { at: 4, label: 'Context' },
      { at: 13, label: 'Concept' },
      { at: 18, label: 'Research' },
      { at: 26, label: 'Development' },
      { at: 39, label: 'Outcome' },
      { at: 46, label: 'Reflection' }
    ]
  },
  'tolstoy-farm': {
    theme: 'visual', cover: 'bleed',
    chapters: [{ at: 1, label: 'Identity' }]
  },
  'hiro-assistant': {
    theme: 'human', cover: 'split',
    chapters: [
      { at: 1, label: 'Overview' },
      { at: 3, label: 'Context' },
      { at: 18, label: 'Research' },
      { at: 56, label: 'Concept' },
      { at: 73, label: 'Development' },
      { at: 100, label: 'Outcome' },
      { at: 109, label: 'Reflection' }
    ]
  },
  'city-in-hand': {
    theme: 'material', cover: 'bleed',
    chapters: [
      { at: 1, label: 'Overview' },
      { at: 3, label: 'Context' },
      { at: 7, label: 'Process' },
      { at: 29, label: 'Outcome' },
      { at: 33, label: 'Reflection' }
    ]
  },
  'dub-transit': {
    theme: 'system', cover: 'inset',
    chapters: [
      { at: 1, label: 'Overview' },
      { at: 4, label: 'Context' },
      { at: 12, label: 'Process' },
      { at: 34, label: 'Development' },
      { at: 49, label: 'Outcome' },
      { at: 63, label: 'Future' },
      { at: 77, label: 'Reflection' }
    ]
  },
  'theyyam-threads': {
    theme: 'visual', cover: 'bleed',
    chapters: [
      { at: 1, label: 'Overview' },
      { at: 5, label: 'Research' },
      { at: 9, label: 'Development' },
      { at: 17, label: 'Reflection' }
    ]
  },
  'artbox': {
    theme: 'visual', cover: 'bleed',
    chapters: [
      { at: 1, label: 'Context' },
      { at: 4, label: 'Development' },
      { at: 11, label: 'Outcome' }
    ]
  },
  'aujus': {
    theme: 'system', cover: 'inset',
    chapters: [
      { at: 1, label: 'Research' },
      { at: 22, label: 'Development' },
      { at: 26, label: 'Outcome' }
    ]
  }
};
