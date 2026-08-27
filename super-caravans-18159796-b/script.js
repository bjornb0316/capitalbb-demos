/* =====================================================================
   Super caravans - gedrag
   ---------------------------------------------------------------------
   Alle voertuigen staan al in de HTML. Dit bestand bouwt niets op, het
   verbergt en sorteert alleen wat er al is. Zet je JavaScript uit, dan
   heb je nog steeds de complete voorraad op je scherm.
   ===================================================================== */
(function () {
  'use strict';

  var doc = document;
  var $  = function (s, w) { return (w || doc).querySelector(s); };
  var $$ = function (s, w) { return Array.prototype.slice.call((w || doc).querySelectorAll(s)); };
  var rust = matchMedia('(prefers-reduced-motion: reduce)').matches;

  doc.documentElement.classList.remove('geen-js');

  /* ----------------------------- gegevens ----------------------------- */
  var DATA = { voertuigen: [] };
  try { DATA = JSON.parse($('#voorraad-data').textContent); } catch (e) { /* dan werkt alleen het filteren */ }
  var perSlug = {};
  DATA.voertuigen.forEach(function (v) { perSlug[v.slug] = v; });

  var euro = function (n) {
    if (n == null) return 'Prijs op aanvraag';
    return '€ ' + Number(n).toLocaleString('nl-NL');
  };
  var getal = function (n) { return Number(n).toLocaleString('nl-NL'); };

  var BEWAARD_SLEUTEL = 'supercaravans-bewaard';
  function bewaardeLijst() {
    try { return JSON.parse(localStorage.getItem(BEWAARD_SLEUTEL)) || []; } catch (e) { return []; }
  }

  /* Staat financiering aan voor deze dealer? De generator zet dit mee.
     Zo niet, dan tonen we nergens een maandbedrag - ook niet in de lade. */
  var FINANCIERING = !!DATA.toonFinanciering;

  /* Annuïteit - dezelfde formule als in de generator, zodat de kaart en
     de rekenmachine nooit een ander bedrag laten zien. */
  var RENTE = 0.079;
  function maandbedrag(krediet, maanden) {
    if (!krediet || krediet <= 0) return 0;
    var r = RENTE / 12;
    return Math.round(krediet * r / (1 - Math.pow(1 + r, -maanden)));
  }

  /* --------------------------- in beeld komen -------------------------- */
  var toon = function (el) { el.classList.add('in'); };
  var teZien = $$('.rv');
  if (rust || !('IntersectionObserver' in window)) {
    teZien.forEach(toon);
  } else {
    var oog = new IntersectionObserver(function (rijen) {
      rijen.forEach(function (r) { if (r.isIntersecting) { toon(r.target); oog.unobserve(r.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    teZien.forEach(function (el) { oog.observe(el); });
    // vangnet: nooit onzichtbare inhoud laten staan
    setTimeout(function () { teZien.forEach(toon); }, 3200);
  }

  /* ----------------------- kop en filterbalk vast ---------------------- */
  var top = $('.top'), filterbalk = $('#filterbalk');
  function bijScroll() {
    var y = window.scrollY;
    if (top) top.classList.toggle('vast', y > 30);
    if (filterbalk) filterbalk.classList.toggle('vast', y > 140);
  }
  bijScroll();
  addEventListener('scroll', bijScroll, { passive: true });

  /* ----------------------------- tellertjes ----------------------------
     De getallen staan al goed in de HTML. Ze worden pas op 0 gezet op het
     moment dat er echt geteld gaat worden - nooit eerder.

     Reden: een tab die op de achtergrond staat of door de browser wordt
     getemperd krijgt amper animatieframes. Zet je vooraf 0 neer en komt
     het volgende frame pas seconden later, dan staat er "0 voertuigen op
     voorraad" op de homepage. Vandaar de controle op document.hidden en
     het vangnet met setTimeout. */
  var tellers = $$('.tel');
  function telOp(el) {
    var tot = +el.dataset.tot || 0;
    if (rust || doc.hidden || !window.requestAnimationFrame) { el.textContent = tot; return; }

    var start = performance.now(), duur = 1100, klaar = false;
    function afronden() { if (!klaar) { klaar = true; el.textContent = tot; } }
    setTimeout(afronden, duur + 700);

    el.textContent = '0';
    (function stap(nu) {
      if (klaar) return;
      var p = Math.min(1, (nu - start) / duur);
      el.textContent = Math.round(tot * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(stap); else afronden();
    })(start);
  }
  if (tellers.length && !rust && 'IntersectionObserver' in window) {
    var telOog = new IntersectionObserver(function (rijen) {
      rijen.forEach(function (r) {
        if (!r.isIntersecting) return;
        telOog.unobserve(r.target);
        telOp(r.target);
      });
    }, { threshold: .4 });
    tellers.forEach(function (el) { telOog.observe(el); });
  }

  /* ====================================================================
     FILTEREN
     ==================================================================== */
  var rooster = $('#rooster');
  if (rooster) {
    // Let op bij het toevoegen van filters: de kaarten dragen zelf ook
    // data-type, data-merk en data-prijs. Selecteer bedieningselementen
    // altijd binnen de filterbalk, anders luistert elke kaart mee.
    var kaarten   = $$('.kaart', rooster);
    var vZoek     = $('#f-zoek');
    var vZoekWis  = $('#f-zoek-wis');
    var vMerk     = $('#f-merk');
    var vPrijs    = $('#f-prijs');
    var vPrijsUit = $('#f-prijs-uit');
    var vJaar     = $('#f-jaar');
    var vJaarUit  = $('#f-jaar-uit');
    var vSorteer  = $('#f-sorteer');
    var vMeer     = $('#f-meer');
    var vPaneel   = $('#f-paneel');
    var vReset    = $('#f-reset');
    var vFav      = $('#f-fav');
    var resTel    = $('#res-tel');
    var leeg      = $('#leeg');
    var meerKnop  = $('#meer-tonen');

    /* Op smalle schermen tonen we er eerst negen. Zie de toelichting in
       stijl.css: anders duwt de voorraad alles eronder van het scherm. */
    var MOBIEL_LIMIET = 9;
    var smalScherm = matchMedia('(max-width:760px)');
    var allesTonen = false;

    var bewaard = bewaardeLijst();

    var staat = {
      zoek: '', type: 'alles', merk: '', prijs: vPrijs ? +vPrijs.max : Infinity,
      jaar: vJaar ? +vJaar.min : 0, kenmerken: [], sorteer: vSorteer ? vSorteer.value : 'prijs-af',
      alleenBewaard: false
    };

    /* --- opslaan van bewaarde voertuigen --- */
    function bewaarWeg() {
      try { localStorage.setItem(BEWAARD_SLEUTEL, JSON.stringify(bewaard)); } catch (e) { /* prive-venster */ }
    }
    function tekenHarten() {
      $$('[data-hart]').forEach(function (b) {
        b.setAttribute('aria-pressed', bewaard.indexOf(b.dataset.hart) > -1 ? 'true' : 'false');
      });
      if (vFav) {
        $('i', vFav).textContent = bewaard.length;
        vFav.hidden = bewaard.length === 0 && !staat.alleenBewaard;
      }
    }
    doc.addEventListener('click', function (e) {
      var knop = e.target.closest('[data-hart]');
      if (!knop) return;
      e.preventDefault();
      var slug = knop.dataset.hart, i = bewaard.indexOf(slug);
      if (i > -1) bewaard.splice(i, 1); else bewaard.push(slug);
      bewaarWeg(); tekenHarten();
      if (staat.alleenBewaard) draaien();
    });

    /* --- de eigenlijke zeef --- */
    function past(kaart) {
      var d = kaart.dataset;
      if (staat.alleenBewaard && bewaard.indexOf(d.slug) === -1) return false;
      if (staat.type !== 'alles' && d.type !== staat.type) return false;
      if (staat.merk && d.merk !== staat.merk) return false;
      var prijs = +d.prijs;
      if (prijs > 0 && prijs > staat.prijs) return false;     // prijs 0 = op aanvraag, die filteren we niet weg
      var jaar = +d.jaar;
      if (jaar > 0 && jaar < staat.jaar) return false;
      if (staat.kenmerken.length) {
        var heeft = d.kenmerken ? d.kenmerken.split('|') : [];
        for (var i = 0; i < staat.kenmerken.length; i++) {
          if (heeft.indexOf(staat.kenmerken[i]) === -1) return false;
        }
      }
      if (staat.zoek) {
        var woorden = staat.zoek.split(/\s+/).filter(Boolean);
        for (var w = 0; w < woorden.length; w++) {
          if (d.zoek.indexOf(woorden[w]) === -1) return false;
        }
      }
      return true;
    }

    function sorteerWaarde(kaart) {
      var d = kaart.dataset;
      switch (staat.sorteer) {
        case 'prijs-op': return +d.prijs || 9e9;              // zonder prijs achteraan
        case 'prijs-af': return -(+d.prijs || -1);
        case 'jaar-af':  return -(+d.jaar || -1);
        case 'jaar-op':  return +d.jaar || 9e9;
        case 'merk':     return d.merk.toLowerCase();
        default:         return 0;
      }
    }

    /* Kapt de lijst af op VISUELE volgorde (dus na het sorteren), niet op
       DOM-volgorde - anders verdwijnen bij 'prijs laag naar hoog' precies
       de verkeerde kaarten. */
    function inklappen(opVolgorde) {
      var beperk = smalScherm.matches && !allesTonen && opVolgorde.length > MOBIEL_LIMIET;
      opVolgorde.forEach(function (k, i) {
        k.classList.toggle('is-ingeklapt', beperk && i >= MOBIEL_LIMIET);
      });
      if (!meerKnop) return;
      meerKnop.hidden = !beperk;
      if (beperk) {
        var rest = opVolgorde.length - MOBIEL_LIMIET;
        meerKnop.textContent = 'Toon de overige ' + rest + (rest === 1 ? ' voertuig' : ' voertuigen');
      }
    }
    if (meerKnop) meerKnop.addEventListener('click', function () {
      allesTonen = true;
      meerKnop.hidden = true;
      draaien();
    });
    if (smalScherm.addEventListener) smalScherm.addEventListener('change', function () { draaien(); });

    function draaien() {
      var zichtbaar = [];
      kaarten.forEach(function (k) {
        var ja = past(k);
        k.hidden = !ja;
        if (ja) zichtbaar.push(k);
      });

      // sorteren via CSS order, dan hoeft er niets door de DOM verplaatst
      var op = zichtbaar.slice().sort(function (a, b) {
        var x = sorteerWaarde(a), y = sorteerWaarde(b);
        return x < y ? -1 : x > y ? 1 : 0;
      });
      op.forEach(function (k, i) { k.style.order = i; });

      // net binnengekomen kaarten mogen niet onzichtbaar blijven staan
      zichtbaar.forEach(function (k) { k.classList.add('in'); });

      inklappen(op);

      if (resTel) {
        var prijzen = zichtbaar.map(function (k) { return +k.dataset.prijs; }).filter(function (p) { return p > 0; });
        var vanaf = prijzen.length ? Math.min.apply(null, prijzen) : null;
        resTel.innerHTML = '<b>' + zichtbaar.length + '</b> '
          + (zichtbaar.length === 1 ? 'voertuig' : 'voertuigen')
          + (vanaf ? ' · vanaf ' + euro(vanaf) : '');
      }
      if (leeg) leeg.hidden = zichtbaar.length > 0;

      var actief = staat.zoek || staat.type !== 'alles' || staat.merk || staat.kenmerken.length
        || staat.alleenBewaard
        || (vPrijs && staat.prijs < +vPrijs.max) || (vJaar && staat.jaar > +vJaar.min);
      if (vReset) vReset.hidden = !actief;
      onthoudInUrl(actief);
    }

    /* --- filters in de adresbalk, zodat een selectie deelbaar is --- */
    function onthoudInUrl(actief) {
      if (!window.history || !history.replaceState) return;
      try {
        var p = new URLSearchParams();
        if (staat.zoek) p.set('q', staat.zoek);
        if (staat.type !== 'alles') p.set('type', staat.type);
        if (staat.merk) p.set('merk', staat.merk);
        if (staat.kenmerken.length) p.set('k', staat.kenmerken.join(','));
        if (vPrijs && staat.prijs < +vPrijs.max) p.set('max', staat.prijs);
        if (vJaar && staat.jaar > +vJaar.min) p.set('vanaf', staat.jaar);
        var vraag = p.toString();
        history.replaceState(null, '', (vraag ? '?' + vraag : location.pathname) + location.hash);
      } catch (e) { /* file:// mag dit niet altijd, geeft niet */ }
    }

    function uitUrl() {
      try {
        var p = new URLSearchParams(location.search);
        if (p.get('q') && vZoek) { staat.zoek = p.get('q').toLowerCase(); vZoek.value = p.get('q'); }
        if (p.get('type')) staat.type = p.get('type');
        if (p.get('merk') && vMerk) { staat.merk = p.get('merk'); vMerk.value = staat.merk; }
        if (p.get('k')) staat.kenmerken = p.get('k').split(',').filter(Boolean);
        if (p.get('max') && vPrijs) { staat.prijs = +p.get('max'); vPrijs.value = staat.prijs; }
        if (p.get('vanaf') && vJaar) { staat.jaar = +p.get('vanaf'); vJaar.value = staat.jaar; }

        $$('.fb-types [data-type]').forEach(function (b) {
          var aan = b.dataset.type === staat.type;
          b.classList.toggle('aan', aan); b.setAttribute('aria-pressed', String(aan));
        });
        $$('#f-paneel [data-kenmerk]').forEach(function (b) {
          var aan = staat.kenmerken.indexOf(b.dataset.kenmerk) > -1;
          b.classList.toggle('aan', aan); b.setAttribute('aria-pressed', String(aan));
        });
        if (vPrijsUit && vPrijs) vPrijsUit.textContent = euro(+vPrijs.value);
        if (vJaarUit && vJaar) vJaarUit.textContent = vJaar.value;
        if (staat.kenmerken.length || staat.merk || (vPrijs && staat.prijs < +vPrijs.max)) opendicht(true);
      } catch (e) { /* niets aan de hand */ }
    }

    /* --- bediening --- */
    var wachten;
    if (vZoek) {
      vZoek.addEventListener('input', function () {
        if (vZoekWis) vZoekWis.hidden = !vZoek.value;
        clearTimeout(wachten);
        wachten = setTimeout(function () { staat.zoek = vZoek.value.trim().toLowerCase(); draaien(); }, 130);
      });
    }
    if (vZoekWis) vZoekWis.addEventListener('click', function () {
      vZoek.value = ''; staat.zoek = ''; vZoekWis.hidden = true; vZoek.focus(); draaien();
    });

    $$('.fb-types [data-type]').forEach(function (b) {
      b.addEventListener('click', function () {
        staat.type = b.dataset.type;
        $$('.fb-types [data-type]').forEach(function (o) {
          var aan = o === b;
          o.classList.toggle('aan', aan); o.setAttribute('aria-pressed', String(aan));
        });
        draaien();
      });
    });

    $$('#f-paneel [data-kenmerk]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.kenmerk, i = staat.kenmerken.indexOf(k);
        if (i > -1) staat.kenmerken.splice(i, 1); else staat.kenmerken.push(k);
        var aan = i === -1;
        b.classList.toggle('aan', aan); b.setAttribute('aria-pressed', String(aan));
        draaien();
      });
    });

    if (vMerk)  vMerk.addEventListener('change', function () { staat.merk = vMerk.value; draaien(); });
    if (vPrijs) vPrijs.addEventListener('input', function () {
      staat.prijs = +vPrijs.value; if (vPrijsUit) vPrijsUit.textContent = euro(staat.prijs); draaien();
    });
    if (vJaar) vJaar.addEventListener('input', function () {
      staat.jaar = +vJaar.value; if (vJaarUit) vJaarUit.textContent = staat.jaar; draaien();
    });
    if (vSorteer) vSorteer.addEventListener('change', function () { staat.sorteer = vSorteer.value; draaien(); });

    function opendicht(open) {
      if (!vPaneel || !vMeer) return;
      var nu = open == null ? vPaneel.hidden : open;
      vPaneel.hidden = !nu;
      vMeer.setAttribute('aria-expanded', String(nu));
    }
    if (vMeer) vMeer.addEventListener('click', function () { opendicht(); });

    if (vFav) vFav.addEventListener('click', function () {
      staat.alleenBewaard = !staat.alleenBewaard;
      vFav.setAttribute('aria-pressed', String(staat.alleenBewaard));
      draaien();
    });

    function allesWissen() {
      staat.zoek = ''; staat.type = 'alles'; staat.merk = ''; staat.kenmerken = [];
      staat.alleenBewaard = false;
      if (vZoek) vZoek.value = '';
      if (vZoekWis) vZoekWis.hidden = true;
      if (vMerk) vMerk.value = '';
      if (vPrijs) { vPrijs.value = vPrijs.max; staat.prijs = +vPrijs.max; if (vPrijsUit) vPrijsUit.textContent = euro(staat.prijs); }
      if (vJaar)  { vJaar.value = vJaar.min;   staat.jaar  = +vJaar.min;  if (vJaarUit)  vJaarUit.textContent = staat.jaar; }
      if (vFav) vFav.setAttribute('aria-pressed', 'false');
      $$('.fb-types [data-type]').forEach(function (o) {
        var aan = o.dataset.type === 'alles';
        o.classList.toggle('aan', aan); o.setAttribute('aria-pressed', String(aan));
      });
      $$('#f-paneel [data-kenmerk]').forEach(function (o) { o.classList.remove('aan'); o.setAttribute('aria-pressed', 'false'); });
      draaien();
    }
    if (vReset) vReset.addEventListener('click', allesWissen);
    $$('[data-reset]').forEach(function (b) { b.addEventListener('click', allesWissen); });

    /* Andere secties mogen het prijsfilter zetten (de rekenmachine doet dat).
       Via deze haak, niet door aan de invoervelden te zitten. */
    window.__zetMaxPrijs = function (bedrag) {
      if (!vPrijs) return;
      var v = Math.max(+vPrijs.min, Math.min(+vPrijs.max, bedrag));
      vPrijs.value = v; staat.prijs = v;
      if (vPrijsUit) vPrijsUit.textContent = euro(v);
      if (vPaneel && vPaneel.hidden) opendicht(true);
      draaien();
    };

    uitUrl();
    tekenHarten();
    draaien();
  }

  /* ====================================================================
     DE LADE - een voertuig van dichtbij
     ==================================================================== */
  var lade = $('#lade'), ladeIn = $('#lade-in'), ladePaneel = $('.lade-paneel');
  var kwamVan = null;

  function waLink(tekst) {
    return 'https://wa.me/' + DATA.whatsapp + '?text=' + encodeURIComponent(tekst);
  }

  function tekenLade(v) {
    var specs = [];
    if (v.bouwjaar) specs.push(['Bouwjaar', v.bouwjaar]);
    if (v.km) specs.push(['Kilometerstand', getal(v.km) + ' km']);
    if (v.brandstof) specs.push(['Brandstof', v.brandstof]);
    if (v.slaapplaatsen) specs.push(['Slaapplaatsen', v.slaapplaatsen]);
    specs.push(['Soort', v.type]);
    specs.push(['Merk', v.merk]);

    var vraag = 'Hallo ' + DATA.bedrijf + ', ik zag de ' + v.titel + ' op uw website. Is deze nog beschikbaar?';
    var kijken = 'Hallo ' + DATA.bedrijf + ', ik wil graag een keer komen kijken naar de ' + v.titel + '. Wanneer schikt het?';

    ladeIn.innerHTML =
      '<div class="ld-foto">'
        + (v.foto
            ? '<img src="' + v.foto + '$_86.jpg" srcset="' + v.foto + '$_85.jpg 726w, ' + v.foto + '$_86.jpg 1024w, ' + v.foto + '$_87.jpg 1920w" sizes="(max-width:700px) 100vw, 620px" alt="' + v.titel + '">'
            : '<div class="geen-foto"><span>Foto op aanvraag</span></div>')
        + '<span class="ld-type">' + v.type + '</span>'
      + '</div>'
      + '<div class="ld-body">'
        + '<div class="ld-kop">'
          + '<p class="ld-merk">' + v.merk + '</p>'
          + '<h2 id="lade-titel">' + v.titel + '</h2>'
        + '</div>'
        + '<div class="ld-prijsrij">'
          + '<div><p class="ld-prijs">' + euro(v.prijs) + '</p>'
          + (FINANCIERING && v.maand
              ? '<p class="ld-maand">of ongeveer ' + euro(v.maand) + ' per maand</p>'
              : (v.prijs ? '' : '<p class="ld-maand">Bel of app ons voor de prijs</p>'))
          + '</div>'
          + '<button class="kaart-hart" type="button" data-hart="' + v.slug + '" aria-pressed="false" aria-label="Bewaar ' + v.titel + '" style="position:static">'
            + '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M12 20.2 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13Z"/></svg>'
          + '</button>'
        + '</div>'
        + '<dl class="ld-specs">' + specs.map(function (s) {
            return '<div class="ld-spec"><dt>' + s[0] + '</dt><dd>' + s[1] + '</dd></div>';
          }).join('') + '</dl>'
        + (v.kenmerken.length
            ? '<ul class="ld-kenmerken">' + v.kenmerken.map(function (k) { return '<li>' + k + '</li>'; }).join('') + '</ul>'
            : '')
        + (FINANCIERING && v.maand
            ? '<div class="ld-blok"><h3>Gespreid betalen</h3>'
              + '<div class="ld-rekenrij"><b>' + euro(v.maand) + '</b><span>per maand, 72 maanden, 7,9&nbsp;% vast</span></div>'
              + '<p class="ld-klein"><b>Let op! Geld lenen kost geld.</b> Rekenvoorbeeld, geen aanbod. '
              + '<a href="#financiering" data-sluit style="color:var(--goud)">Zelf rekenen</a></p></div>'
            : '')
        + '<div class="ld-acties">'
          + '<a class="knop knop-goud" href="' + waLink(vraag) + '" rel="noopener">Vraag ernaar via WhatsApp</a>'
          + '<a class="knop knop-glas" href="tel:' + DATA.telefoon + '">Bel ' + DATA.telefoonMooi + '</a>'
          + '<a class="knop knop-glas" href="' + waLink(kijken) + '" rel="noopener">Plan een bezichtiging</a>'
          + '<a class="knop knop-stil" href="#bezoek" data-sluit>Kies zelf een moment</a>'
        + '</div>'
        + '<p class="ld-klein">Meer foto’s of een filmpje? Vraag het gerust, dan sturen we ze door. '
        + 'U bent ook zonder afspraak welkom, maar met een belletje vooraf weet u zeker dat hij klaarstaat.</p>'
      + '</div>';

    // hart in de lade laten kloppen met de rest
    var h = $('[data-hart]', ladeIn);
    if (h) h.setAttribute('aria-pressed', bewaardeLijst().indexOf(v.slug) > -1 ? 'true' : 'false');
  }

  function openLade(slug) {
    var v = perSlug[slug];
    if (!v || !lade) return;
    kwamVan = doc.activeElement;
    tekenLade(v);
    lade.hidden = false;
    doc.body.style.overflow = 'hidden';
    if (ladePaneel) ladePaneel.focus();
  }

  function sluitLade(viaHash) {
    if (!lade || lade.hidden) return;
    lade.hidden = true;
    doc.body.style.overflow = '';
    if (!viaHash && location.hash.indexOf('#v/') === 0) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (kwamVan && kwamVan.focus) kwamVan.focus();
    kwamVan = null;
  }

  function bekijkHash() {
    var h = location.hash;
    if (h.indexOf('#v/') === 0) openLade(decodeURIComponent(h.slice(3)));
    else sluitLade(true);
  }
  addEventListener('hashchange', bekijkHash);
  bekijkHash();

  doc.addEventListener('click', function (e) {
    if (e.target.closest('[data-sluit]')) {
      var link = e.target.closest('a[data-sluit]');
      sluitLade(!!link);
    }
  });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') sluitLade();
    // Tab vasthouden binnen de lade
    if (e.key === 'Tab' && lade && !lade.hidden && ladePaneel) {
      var pak = $$('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])', ladePaneel)
        .filter(function (el) { return el.offsetParent !== null; });
      if (!pak.length) return;
      var eerste = pak[0], laatste = pak[pak.length - 1];
      if (e.shiftKey && doc.activeElement === eerste) { e.preventDefault(); laatste.focus(); }
      else if (!e.shiftKey && doc.activeElement === laatste) { e.preventDefault(); eerste.focus(); }
    }
  });

  /* ====================================================================
     REKENMACHINE
     ==================================================================== */
  (function () {
    var bedrag = $('#fin-bedrag'), aanbet = $('#fin-aanbetaling');
    if (!bedrag) return;
    var looptijd = 72;

    function reken() {
      var b = +bedrag.value, a = Math.min(+aanbet.value, b), krediet = Math.max(0, b - a);
      var m = maandbedrag(krediet, looptijd);

      $('#fin-bedrag-uit').textContent = euro(b);
      $('#fin-aanbetaling-uit').textContent = euro(a);
      $('#fin-krediet').textContent = euro(krediet);
      $('#fin-mnd').textContent = looptijd + ' maanden';
      $('#fin-maand').textContent = krediet ? euro(m) : euro(0);
      $('#fin-totaal').textContent = krediet ? euro(m * looptijd + a) : euro(b);

      var knopB = $('#fin-toon b');
      if (knopB) knopB.textContent = euro(Math.min(b, 999999));

      var cta = $('#fin-cta');
      if (cta) {
        cta.href = 'https://wa.me/' + DATA.whatsapp + '?text=' + encodeURIComponent(
          'Hallo ' + DATA.bedrijf + ', ik heb op uw website gerekend: aankoopbedrag ' + euro(b)
          + ', aanbetaling ' + euro(a) + ', looptijd ' + looptijd + ' maanden. '
          + 'Dat komt uit op ongeveer ' + euro(m) + ' per maand. Wat zijn de mogelijkheden?');
      }
    }

    var toon = $('#fin-toon');
    if (toon) toon.addEventListener('click', function () {
      if (window.__zetMaxPrijs) window.__zetMaxPrijs(+bedrag.value);
      var doel = $('#voorraad');
      if (doel) doel.scrollIntoView({ behavior: rust ? 'auto' : 'smooth', block: 'start' });
    });

    bedrag.addEventListener('input', reken);
    if (aanbet) aanbet.addEventListener('input', reken);
    $$('[data-looptijd]').forEach(function (b) {
      b.addEventListener('click', function () {
        looptijd = +b.dataset.looptijd;
        $$('[data-looptijd]').forEach(function (o) {
          var aan = o === b;
          o.classList.toggle('aan', aan); o.setAttribute('aria-pressed', String(aan));
        });
        reken();
      });
    });
    reken();
  })();

  /* ====================================================================
     INRUIL / INKOOP - drie stappen
     ==================================================================== */
  (function () {
    var form = $('#taxatie');
    if (!form) return;
    var keuze = { soort: 'Caravan', staat: 'Netjes', wens: 'Inruilen', extra: [] };

    $$('[data-tx]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var groep = b.dataset.tx;
        keuze[groep] = b.dataset.waarde;
        $$('[data-tx="' + groep + '"]', form).forEach(function (o) {
          var aan = o === b;
          o.classList.toggle('aan', aan); o.setAttribute('aria-pressed', String(aan));
        });
        vatSamen();
      });
    });
    $$('[data-tx-multi]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var w = b.dataset.waarde, i = keuze.extra.indexOf(w);
        if (i > -1) keuze.extra.splice(i, 1); else keuze.extra.push(w);
        var aan = i === -1;
        b.classList.toggle('aan', aan); b.setAttribute('aria-pressed', String(aan));
        vatSamen();
      });
    });

    function naarStap(n) {
      $$('.tx-stap', form).forEach(function (s) {
        var aan = +s.dataset.stap === n;
        s.hidden = !aan; s.classList.toggle('aan', aan);
      });
      $$('[data-rail]').forEach(function (li) {
        var nr = +li.dataset.rail;
        li.classList.toggle('aan', nr === n);
        li.classList.toggle('klaar', nr < n);
      });
      if (n === 3) vatSamen();
      var kop = $('.tx-rail');
      if (kop && !rust) kop.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    $$('[data-volgende]', form).forEach(function (b) {
      b.addEventListener('click', function () { naarStap(+b.dataset.volgende); });
    });
    $$('[data-vorige]', form).forEach(function (b) {
      b.addEventListener('click', function () { naarStap(+b.dataset.vorige); });
    });

    function samenvatting() {
      var merk = ($('#tx-merk').value || '').trim();
      var jaar = ($('#tx-jaar').value || '').trim();
      return [
        ['Wat', keuze.soort + (merk ? ' — ' + merk : '')],
        ['Bouwjaar', jaar || 'onbekend'],
        ['Staat', keuze.staat],
        ['Erop en eraan', keuze.extra.length ? keuze.extra.join(', ') : 'niets bijzonders'],
        ['Wens', keuze.wens === 'Inruilen' ? 'inruilen tegen iets uit uw voorraad' : 'direct verkopen']
      ];
    }
    function vatSamen() {
      var vak = $('#tx-samenvatting');
      if (!vak) return;
      vak.classList.add('aan');
      vak.innerHTML = '<b>Dit sturen we mee</b><dl>'
        + samenvatting().map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('')
        + '</dl>';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var naam = $('#tx-naam'), tel = $('#tx-tel');
      var stuk = null;
      [naam, tel].forEach(function (v) {
        var leeg = !v.value.trim();
        v.setAttribute('aria-invalid', leeg ? 'true' : 'false');
        if (leeg && !stuk) stuk = v;
      });
      if (stuk) { stuk.focus(); return; }

      var tekst = 'Hallo ' + DATA.bedrijf + ', ik wil graag weten wat mijn '
        + keuze.soort.toLowerCase() + ' waard is.\n\n'
        + samenvatting().map(function (r) { return r[0] + ': ' + r[1]; }).join('\n')
        + '\n\nNaam: ' + naam.value.trim() + '\nTelefoon: ' + tel.value.trim();
      window.open(waLink(tekst), '_blank', 'noopener');
    });
  })();

  /* ====================================================================
     AFSPRAAK PLANNEN
     ==================================================================== */
  (function () {
    var dagenVak = $('#plan-dagen'), tijdenVak = $('#plan-tijden'), form = $('#planner');
    if (!dagenVak || !form) return;

    var DAGNAAM = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
    var MAAND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    var gekozenDag = null, gekozenTijd = null;

    // veertien dagen vooruit, zondag dicht
    var vandaag = new Date(); vandaag.setHours(0, 0, 0, 0);
    var dagen = [];
    for (var i = 1; dagen.length < 12 && i < 20; i++) {
      var dag = new Date(vandaag); dag.setDate(vandaag.getDate() + i);
      if (dag.getDay() === 0) continue;                       // zondag slaan we over
      dagen.push(dag);
    }

    // Let op: geen toISOString() hier. Die rekent naar UTC en schuift een
    // datum die om middernacht lokaal begint een dag terug.
    function sleutel(dag) {
      var m = dag.getMonth() + 1, g = dag.getDate();
      return dag.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (g < 10 ? '0' : '') + g;
    }

    dagenVak.innerHTML = dagen.map(function (dag, i) {
      return '<button class="dag' + (i === 0 ? ' aan' : '') + '" type="button" data-dag="' + sleutel(dag) + '">'
        + '<em>' + DAGNAAM[dag.getDay()] + '</em>'
        + '<b>' + dag.getDate() + '</b>'
        + '<i>' + MAAND[dag.getMonth()] + '</i>'
        + '</button>';
    }).join('');
    gekozenDag = dagen[0];

    function tijdenVoor(dag) {
      return dag.getDay() === 6
        ? ['09:30', '10:30', '11:30', '12:30']                 // zaterdag korter
        : ['09:30', '10:30', '11:30', '13:30', '14:30', '15:30', '16:30'];
    }
    function tekenTijden() {
      var lijst = tijdenVoor(gekozenDag);
      if (lijst.indexOf(gekozenTijd) === -1) gekozenTijd = lijst[0];
      tijdenVak.innerHTML = lijst.map(function (t) {
        var aan = t === gekozenTijd;
        return '<button class="chip' + (aan ? ' aan' : '') + '" type="button" data-tijd="' + t + '" aria-pressed="' + aan + '">' + t + '</button>';
      }).join('');
      bevestig();
    }

    dagenVak.addEventListener('click', function (e) {
      var b = e.target.closest('[data-dag]');
      if (!b) return;
      gekozenDag = new Date(b.dataset.dag + 'T00:00:00');
      $$('[data-dag]', dagenVak).forEach(function (o) { o.classList.toggle('aan', o === b); });
      tekenTijden();
    });
    tijdenVak.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tijd]');
      if (!b) return;
      gekozenTijd = b.dataset.tijd;
      $$('[data-tijd]', tijdenVak).forEach(function (o) {
        var aan = o === b;
        o.classList.toggle('aan', aan); o.setAttribute('aria-pressed', String(aan));
      });
      bevestig();
    });

    function mooieDag() {
      var vol = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
      var maandVol = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
      return vol[gekozenDag.getDay()] + ' ' + gekozenDag.getDate() + ' ' + maandVol[gekozenDag.getMonth()];
    }
    function bevestig() {
      var vak = $('#plan-bevestig');
      if (!vak) return;
      vak.classList.add('aan');
      vak.innerHTML = '<b>' + mooieDag() + ' om ' + gekozenTijd + '</b>'
        + '<span>&mdash; dan zetten we hem voor u klaar.</span>';
    }
    tekenTijden();

    // vanuit de lade doorgestuurd? dan het voertuig alvast invullen
    addEventListener('hashchange', function () { /* niets, maar hier kan later slimheid bij */ });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var naam = $('#plan-naam'), tel = $('#plan-tel'), voertuig = $('#plan-voertuig');
      var stuk = null;
      [naam, tel].forEach(function (v) {
        var leeg = !v.value.trim();
        v.setAttribute('aria-invalid', leeg ? 'true' : 'false');
        if (leeg && !stuk) stuk = v;
      });
      if (stuk) { stuk.focus(); return; }

      var tekst = 'Hallo ' + DATA.bedrijf + ', ik wil graag langskomen op '
        + mooieDag() + ' om ' + gekozenTijd + '.\n\n'
        + (voertuig.value ? 'Ik kom voor: ' + voertuig.value + '\n' : 'Ik kom even rondkijken.\n')
        + 'Naam: ' + naam.value.trim() + '\nTelefoon: ' + tel.value.trim();
      window.open(waLink(tekst), '_blank', 'noopener');
    });
  })();

  /* ------------------------------ terugbellen ------------------------------ */
  (function () {
    var form = $('#terugbel');
    if (!form) return;
    var wanneer = 'Zo snel mogelijk';
    $$('[data-terugbel]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        wanneer = b.dataset.terugbel;
        $$('[data-terugbel]', form).forEach(function (o) {
          var aan = o === b;
          o.classList.toggle('aan', aan); o.setAttribute('aria-pressed', String(aan));
        });
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var tel = $('#tb-tel');
      if (!tel.value.trim()) { tel.setAttribute('aria-invalid', 'true'); tel.focus(); return; }
      tel.setAttribute('aria-invalid', 'false');
      window.open(waLink('Hallo ' + DATA.bedrijf + ', kunt u mij terugbellen op ' + tel.value.trim()
        + '? Wanneer het schikt: ' + wanneer.toLowerCase() + '.'), '_blank', 'noopener');
    });
  })();

  /* ---------------------- schermvullend menu (variant B) ----------------------
     De navigatie zit achter een knop. Dat mag alleen als hij ook zonder muis
     weer dicht kan: Escape, een klik naast de lijst, de sluitknop en elke link
     sluiten hem. De focus springt bij openen de lijst in en bij sluiten terug
     naar de knop - behalve als je op een link klikt, want dan hoort de focus
     bij het doel te blijven.

     Zonder JavaScript blijft dit blok gewoon als linkrij onder de kopbalk
     staan; zie de .geen-js-regels in stijl.css. */
  (function () {
    var knop = $('.menu-knop');
    var menu = $('#menu');
    if (!knop || !menu) return;

    var body = doc.body;
    var sluit = $('.menu-sluit', menu);

    function zet(open, terugFocus) {
      body.classList.toggle('menu-open', open);
      knop.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-hidden', String(!open));
      if (open) {
        setTimeout(function () { (menu.querySelector('a') || sluit).focus(); }, 0);
      } else if (terugFocus !== false) {
        knop.focus();
      }
    }

    knop.addEventListener('click', function () {
      zet(!body.classList.contains('menu-open'));
    });
    if (sluit) sluit.addEventListener('click', function () { zet(false); });
    $$('a', menu).forEach(function (a) {
      a.addEventListener('click', function () { zet(false, false); });
    });
    menu.addEventListener('click', function (e) { if (e.target === menu) zet(false); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && body.classList.contains('menu-open')) zet(false);
    });

    menu.setAttribute('aria-hidden', 'true');
  })();

  /* ------------------- wat over de pagina's heen moet werken -------------------
     De site is opgeknipt in losse pagina's. Drie dingen die eerst binnen een
     pagina konden, moeten nu een pagina verder reiken. */
  (function () {

    /* 1. De rekenmachine staat op zijn eigen pagina en kan dus niet meer naar
          de voorraad scrollen. Hij is daarom een link geworden; hier houden we
          alleen zijn adres gelijk aan de schuif. Het bestaande blok hierboven
          blijft gewoon de tekst in de knop bijwerken. */
    var toon = $('#fin-toon');
    var bedrag = $('#fin-bedrag');
    if (toon && bedrag && toon.tagName === 'A' && !$('#rooster')) {
      var grond = toon.getAttribute('href').split('?')[0];
      var zetAdres = function () { toon.href = grond + '?max=' + bedrag.value; };
      bedrag.addEventListener('input', zetAdres);
      zetAdres();
    }

    /* 2. Vanaf een productpagina kun je een bezichtiging plannen. Het voertuig
          reist mee in de adresbalk, zodat je het niet nog eens hoeft te kiezen. */
    var keuze = $('#plan-voertuig');
    if (keuze) {
      try {
        var gevraagd = new URLSearchParams(location.search).get('voertuig');
        if (gevraagd) {
          var raak = $$('option', keuze).filter(function (o) { return o.value === gevraagd; })[0];
          if (raak) {
            keuze.value = raak.value;
            keuze.setAttribute('data-vooraf', '1');
          }
        }
      } catch (e) { /* oude browser, dan kiest de bezoeker zelf */ }
    }

    /* 3. Bewaren zit in het filterblok, en dat draait alleen waar een voorraad
          staat. Op een productpagina is er wel een bewaarknop en geen voorraad.
          Dan doet dit kleine blok het werk - dezelfde sleutel, dus wat je hier
          bewaart staat straks in de voorraad tussen je bewaarde voertuigen. */
    if (!$('#rooster') && $('[data-hart]')) {
      var lijst = bewaardeLijst();
      var teken = function () {
        $$('[data-hart]').forEach(function (b) {
          b.setAttribute('aria-pressed', lijst.indexOf(b.dataset.hart) > -1 ? 'true' : 'false');
        });
      };
      doc.addEventListener('click', function (e) {
        var knop = e.target.closest('[data-hart]');
        if (!knop) return;
        e.preventDefault();
        var slug = knop.dataset.hart, i = lijst.indexOf(slug);
        if (i > -1) lijst.splice(i, 1); else lijst.push(slug);
        try { localStorage.setItem(BEWAARD_SLEUTEL, JSON.stringify(lijst)); } catch (e2) { /* prive-venster */ }
        teken();
      });
      teken();
    }
  })();

})();
