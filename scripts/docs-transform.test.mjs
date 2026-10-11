// Tests of scripts/docs-transform.mjs (Markdown transformations of sync-docs).
// Run: npm run test-sync-docs   (node --test, no dependency)

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertCallouts, frenchTypography, NBSP, NNBSP } from './docs-transform.mjs';

const fr = frenchTypography;
// Readable expectations: ° is a non-breaking space, ^ a narrow non-breaking space.
const t = (s) => s.replaceAll('°', NBSP).replaceAll('^', NNBSP);

// ---------- GitHub alerts ----------
test('one-line and multi-line alerts become asides', () => {
  assert.equal(convertCallouts('> [!NOTE]\n> Hello.'), ':::note\nHello.\n:::');
  assert.equal(
    convertCallouts('Before.\n\n> [!WARNING]\n> First line,\n> second line.\n\nAfter.'),
    'Before.\n\n:::caution\nFirst line,\nsecond line.\n:::\n\nAfter.',
  );
});

test('every alert type has its aside', () => {
  const kind = (k) => convertCallouts(`> [!${k}]\n> x`).split('\n')[0];
  assert.equal(kind('NOTE'), ':::note');
  assert.equal(kind('TIP'), ':::tip');
  assert.equal(kind('IMPORTANT'), ':::note[Important]');
  assert.equal(kind('WARNING'), ':::caution');
  assert.equal(kind('CAUTION'), ':::danger');
  assert.equal(kind('note'), ':::note');
});

test('alerts keep paragraphs, lists and nested quotes', () => {
  assert.equal(
    convertCallouts('> [!TIP]\n> One.\n>\n> - a\n> - b\n> > quoted'),
    ':::tip\nOne.\n\n- a\n- b\n> quoted\n:::',
  );
});

test('an alert ends at the first line outside the quote', () => {
  assert.equal(convertCallouts('> [!NOTE]\n> In.\nOut.'), ':::note\nIn.\n:::\nOut.');
});

test('an indented alert (in a list item) keeps its indentation', () => {
  assert.equal(
    convertCallouts('1. Step.\n\n   > [!CAUTION]\n   > Careful.\n\n2. Next.'),
    '1. Step.\n\n   :::danger\n   Careful.\n   :::\n\n2. Next.',
  );
});

test('plain quotes and alerts inside code blocks are left alone', () => {
  assert.equal(convertCallouts('> Just a quote.\n> [!NOTE]'), '> Just a quote.\n> [!NOTE]');
  const code = '```md\n> [!NOTE]\n> x\n```';
  assert.equal(convertCallouts(code), code);
  assert.equal(convertCallouts('> [!NOTE] title\n> x'), '> [!NOTE] title\n> x');
});

// ---------- French typography ----------
test('apostrophes after a letter', () => {
  assert.equal(fr("L'API d'aujourd'hui"), 'L’API d’aujourd’hui');
  assert.equal(fr("l'**inbox** et l'[API](api.md) et d'`index`"), 'l’**inbox** et l’[API](api.md) et d’`index`');
});

test('spaces before : ; ? !', () => {
  assert.equal(fr('Exemple : un ; deux ? trois !'), t('Exemple°: un^; deux^? trois^!'));
  assert.equal(fr('**Note :** voir'), t('**Note°:** voir'));
  assert.equal(fr('Vraiment ?!'), t('Vraiment^?!'));
  // Existing non-breaking spaces are normalized, not doubled.
  assert.equal(fr(`a${NBSP}; b${NNBSP}:`), t('a^; b°:'));
});

test('no space is added where there was none', () => {
  assert.equal(fr('Note: 12:30, a:b, C:\\ et Pourquoi?'), 'Note: 12:30, a:b, C:\\ et Pourquoi?');
});

test('guillemets get non-breaking spaces inside', () => {
  assert.equal(fr('le bouton « Brancher »'), t('le bouton «°Brancher°»'));
  assert.equal(fr('le bouton «Brancher»'), t('le bouton «°Brancher°»'));
  assert.equal(fr('« `x` »'), t('«°`x`°»'));
  assert.equal(fr(`«${NBSP}déjà${NBSP}»`), t('«°déjà°»'));
});

test('inline code is left alone', () => {
  assert.equal(fr("`l'option : x` : c'est"), t("`l'option : x`°: c’est"));
  assert.equal(fr("``a ` b'c`` d'e"), "``a ` b'c`` d’e");
});

test('fenced code blocks are left alone', () => {
  const md = "Avant :\n\n```sh\necho 'a : b' ; ls ?\n```\n\n~~~\nl'x\n~~~\nAprès !";
  assert.equal(fr(md), t("Avant°:\n\n```sh\necho 'a : b' ; ls ?\n```\n\n~~~\nl'x\n~~~\nAprès^!"));
  const indented = "1. Étape :\n\n      ```sh\n      echo 'x' ; y\n      ```";
  assert.equal(fr(indented), t("1. Étape°:\n\n      ```sh\n      echo 'x' ; y\n      ```"));
});

test('URLs, link targets and images are left alone', () => {
  assert.equal(fr("[l'aide](https://x.org/a?b=c's \"titre : x\")"), "[l’aide](https://x.org/a?b=c's \"titre : x\")");
  assert.equal(fr("Voir https://x.org/l'a?q=1 ; ok"), t("Voir https://x.org/l'a?q=1^; ok"));
  assert.equal(fr("Voir <https://x.org/?a> !"), t('Voir <https://x.org/?a>^!'));
  assert.equal(fr("Voir ![l'image](a.png) !"), t('Voir ![l’image](a.png)^!'));
  assert.equal(fr("[réf]: https://x.org/l'a 'titre'"), "[réf]: https://x.org/l'a 'titre'");
  assert.equal(fr('[x](<a b.md>) : y'), t('[x](<a b.md>)°: y'));
});

test('HTML tags and comments are left alone', () => {
  assert.equal(fr('<img alt="l\'image : x" src="a.png"> ok ?'), t('<img alt="l\'image : x" src="a.png"> ok^?'));
  assert.equal(fr("<!-- l'x : y -->"), "<!-- l'x : y -->");
  assert.equal(fr("<!--\nl'x : y\n-->\nl'z"), "<!--\nl'x : y\n-->\nl’z");
});

test('tables keep their delimiter rows; cells are typeset', () => {
  const md = "| Clé | Rôle |\n| :--- | ---: |\n| `a` | l'accès : lecture |";
  assert.equal(fr(md), t("| Clé | Rôle |\n| :--- | ---: |\n| `a` | l’accès°: lecture |"));
});

test('lists, headings, emphasis and asides', () => {
  assert.equal(fr("- l'un : 1\n- l'autre ; 2"), t('- l’un°: 1\n- l’autre^; 2'));
  assert.equal(fr("## Qu'est-ce que c'est ?"), t('## Qu’est-ce que c’est^?'));
  assert.equal(fr(':::note[Important]\nAttention !\n:::'), t(':::note[Important]\nAttention^!\n:::'));
  assert.equal(fr('Voir :::'), 'Voir :::');
  assert.equal(fr('Colonnes :--- non'), 'Colonnes :--- non');
});

test('callouts then typography (as sync-docs does)', () => {
  const md = "> [!NOTE]\n> L'aide (`--help`) : en anglais ; voir « CLI ».";
  assert.equal(fr(convertCallouts(md)), t(':::note\nL’aide (`--help`)°: en anglais^; voir «°CLI°».\n:::'));
});
