/**
 * Het menu in de balk, op een telefoon uitklapbaar.
 *
 * Hiervoor werden op smalle schermen gewoon links verstopt met `display:none`:
 * "Hoe het werkt", "Kosten" en "Vragen" waren op een telefoon simpelweg niet
 * te bereiken. Dat is geen responsief ontwerp maar verlies.
 *
 * Nu staat alles achter één knop. De belangrijkste knop (de oproep tot actie)
 * blijft altijd zichtbaar in de balk, want die is de reden dat de pagina
 * bestaat; de rest klapt uit.
 *
 * Progressief: zonder javascript staat het menu gewoon open en loopt het door
 * op meerdere regels. Onbereikbare links zijn erger dan een balk die wat
 * hoger is.
 */

const balk = document.querySelector('.balk');
const nav = document.getElementById('balk-nav');
if (balk && nav) {
  const knop = document.createElement('button');
  knop.type = 'button';
  knop.className = 'menuknop';
  knop.id = 'menuknop';
  knop.setAttribute('aria-controls', 'balk-nav');
  knop.setAttribute('aria-expanded', 'false');
  knop.setAttribute('aria-label', 'Menu openen');
  knop.innerHTML = '<span class="menuknop__streep"></span>'
    + '<span class="menuknop__streep"></span><span class="menuknop__streep"></span>';

  // Pas nu aankondigen dat het menu inklapbaar is: zonder deze klasse toont
  // de stijl alles gewoon, en dat is precies wat er zonder javascript hoort.
  balk.classList.add('balk--met-menu');
  const houder = balk.querySelector('.balk__inhoud') || balk;
  houder.append(knop);

  const zet = (open) => {
    balk.classList.toggle('balk--open', open);
    knop.setAttribute('aria-expanded', String(open));
    knop.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
  };

  knop.addEventListener('click', () => zet(!balk.classList.contains('balk--open')));

  // Een gekozen link sluit het menu; anders blijft het over de pagina hangen
  // waar je net naartoe sprong.
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) zet(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && balk.classList.contains('balk--open')) {
      zet(false);
      knop.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!balk.classList.contains('balk--open')) return;
    if (!balk.contains(e.target)) zet(false);
  });

  // Draait iemand zijn telefoon en past alles weer naast elkaar, dan hoort
  // het paneel niet open te blijven staan.
  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) zet(false);
  });
}
