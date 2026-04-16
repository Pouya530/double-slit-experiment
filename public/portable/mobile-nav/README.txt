Portable marketing header + full-screen nav (Double Slit Experiment)

What to copy to another project
- mobile-nav.css   (repo root: public/mobile-nav.css)
- nav-mobile.js    (repo root: public/nav-mobile.js)
- HTML: the site <header id="site-header"> with #nav-burger plus the #nav-mobile-overlay block (see public/index.html)

Load order
1. Your base stylesheet must define at least: --maintext, --menudivider, --accent-secondary (see public/styles.css :root in this repo), OR add those to :root in your project before mobile-nav.css.
2. Link mobile-nav.css after that base.
3. Body classes page-home or page-marketing unlock the desktop pull-out sheet + stagger animations used on this site; other pages still get the standard mobile overlay.

Interactive demo (/demo/) on doubleslitexperiment.app uses only demo.css and does not load mobile-nav.css or nav-mobile.js — splitting these files does not change the demo.
