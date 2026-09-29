/**
 * De illustraties van de campagnelanding.
 *
 * Ze staan hier en niet in `campagnepagina.js`, om één reden: een svg van
 * vijftien vormen tussen de tekst maakt de pagina onleesbaar voor wie er
 * later een zin in wil veranderen. Hier staan de tekeningen, daar staat het
 * verhaal.
 *
 * Ze zijn met opzet inline en geen `<img>`: het zijn er tien, en tien extra
 * verzoeken op een pagina waar advertentiegeld achter zit kost meetbaar
 * conversie. Ze kleuren bovendien mee met de sectie waar ze in staan.
 *
 * Elke tekening is `aria-hidden`: ze zeggen niets wat er niet ook in woorden
 * naast staat. Waar er wel tekst in staat (de kalender, de prijsring) is het
 * een functie, want die tekst komt uit `dwangsom.js` en `tarief.js` - niet
 * uit de tekening. Een ring die 20% tekent terwijl de funnel 25% afrekent is
 * een onjuiste prijsvermelding, ook als het een plaatje is.
 */

/** Tekst die in een svg terechtkomt, ontdaan van tekens die de markup breken. */
function veilig(tekst) {
  return String(tekst ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Drie brieven en een vraagteken: de stapel post waar niemand uit wijs wordt. */
export const HERKENNING = `<svg class="scene-svg" viewBox="0 0 340 240" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><ellipse cx="164" cy="126" rx="134" ry="89" fill="#DCEBFF"/><g transform="rotate(-13 110 115)"><rect x="32" y="30" width="132" height="164" rx="5" fill="#B9D1F5" stroke="#426DAB" stroke-width="2"/><path d="M53 60h56M53 75h86M53 87h70" stroke="#678FC3" stroke-width="5" stroke-linecap="round"/></g><g transform="rotate(11 224 112)"><rect x="167" y="20" width="123" height="167" rx="5" fill="#EFF6FF" stroke="#7297CD" stroke-width="2"/><path d="M187 51h55M187 69h79M187 82h70M187 107h80M187 121h69" stroke="#B6CCE8" stroke-width="5" stroke-linecap="round"/></g><g><rect x="99" y="20" width="137" height="181" rx="5" fill="white" stroke="#263767" stroke-width="2"/><path d="M120 46h36" stroke="#0B1250" stroke-width="6" stroke-linecap="round"/><path d="M120 71h91M120 84h80" stroke="#B4C8E6" stroke-width="5" stroke-linecap="round"/><rect x="117" y="102" width="87" height="18" rx="3" fill="#BEEADA"/><path d="M124 111h72" stroke="#137E70" stroke-width="3" stroke-linecap="round"/><path d="M120 139h90M120 152h83M120 165h60" stroke="#CCD9ED" stroke-width="5" stroke-linecap="round"/></g><circle cx="249" cy="157" r="36" fill="#E2F7EE" stroke="#087F72" stroke-width="6"/><path d="m275 183 32 32" stroke="#087F72" stroke-width="12" stroke-linecap="round"/><path d="M236 157h25M248 145v25" stroke="#58A99B" stroke-width="3" stroke-linecap="round"/></svg>`;

/** Een envelop die weggaat: de officiële melding die wij opstellen. */
export const MELDING = `<svg class="scene-svg" viewBox="0 0 200 170" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="96" cy="80" r="68" fill="#CFEFE6"/><rect x="50" y="25" width="86" height="102" rx="5" fill="white" stroke="#0B1250" stroke-width="2.5"/><path d="M66 47h31M66 63h51M66 77h40" stroke="#8CB9C3" stroke-width="5" stroke-linecap="round"/><path d="M27 80h132v66H27z" fill="#B5E5D8" stroke="#0B1250" stroke-width="2.5" stroke-linejoin="round"/><path d="m27 80 66 42 66-42M27 146l43-39M159 146l-44-39" stroke="#0B1250" stroke-width="2.5" stroke-linejoin="round"/><circle cx="159" cy="61" r="26" fill="#087F72"/><path d="M145 61h28m-10-10 11 10-11 10" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** De uitkomst waarin UWV alsnog beslist. */
export const UITKOMST_BESLISSING = `<svg class="outcome-art" viewBox="0 0 115 115" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="56" cy="58" r="48" fill="#DBE9FF"/><rect x="27" y="18" width="52" height="73" rx="4" fill="white" stroke="#213366" stroke-width="2.5"/><path d="M38 36h28M38 48h22M38 60h27" stroke="#89AAD4" stroke-width="4" stroke-linecap="round"/><circle cx="82" cy="77" r="22" fill="#C4DDFA" stroke="#254E85" stroke-width="2.5"/><path d="m72 77 7 7 14-15" stroke="#254E85" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** De uitkomst waarin een vergoeding gaat lopen. */
export const UITKOMST_VERGOEDING = `<svg class="outcome-art" viewBox="0 0 115 115" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="56" cy="58" r="48" fill="#FCE4BD"/><path d="M20 71v13c0 7 18 12 39 12s39-5 39-12V71" fill="#E9B76B" stroke="#77552A" stroke-width="2.5"/><ellipse cx="59" cy="71" rx="39" ry="12" fill="#FFEAC7" stroke="#77552A" stroke-width="2.5"/><path d="M20 56v12c0 7 18 12 39 12s39-5 39-12V56" fill="#F6D499" stroke="#77552A" stroke-width="2.5"/><ellipse cx="59" cy="56" rx="39" ry="12" fill="#FFF6E6" stroke="#77552A" stroke-width="2.5"/><circle cx="61" cy="31" r="23" fill="#F6D499" stroke="#77552A" stroke-width="2.5"/><path d="M68 20c-12-4-20 17-7 22h7M48 28h19M47 34h18" stroke="#0B1250" stroke-width="2.5" stroke-linecap="round"/></svg>`;

/** Een document dat heel blijft: de aanvraag verandert niet. */
export const GERUSTSTELLING = `<svg class="scene-svg" viewBox="0 0 300 250" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="143" cy="128" r="100" stroke="#416493" stroke-width="2"/><circle cx="143" cy="128" r="79" fill="#192D66"/><g transform="rotate(-7 129 127)"><rect x="77" y="39" width="116" height="156" rx="7" fill="#F4F8FF"/><path d="M97 65h39" stroke="#203968" stroke-width="6" stroke-linecap="round"/><path d="M97 91h75M97 105h75M97 119h61" stroke="#ACC5E9" stroke-width="5" stroke-linecap="round"/><rect x="94" y="141" width="73" height="19" rx="3" fill="#CDEDE1"/><path d="M103 150h54" stroke="#278573" stroke-width="3" stroke-linecap="round"/></g><circle cx="223" cy="161" r="45" fill="#CDEDE1" stroke="#101C50" stroke-width="6"/><circle cx="223" cy="161" r="31" stroke="#0A7469" stroke-width="2.5"/><path d="M223 140v22l14 9" stroke="#0A7469" stroke-width="3.5" stroke-linecap="round"/><path d="M223 190v3M223 129v3M251 161h3M192 161h3" stroke="#0A7469" stroke-width="2.5" stroke-linecap="round"/><circle cx="51" cy="65" r="7" fill="#71BCA8"/><circle cx="259" cy="63" r="4" fill="#729DDD"/><path d="M63 206h21m-10-10v21" stroke="#7499CF" stroke-width="3" stroke-linecap="round"/></svg>`;

/** Het documentteken bij onze bedrijfsgegevens. */
export const BRIEFMERK = `<svg class="brand-document" viewBox="0 0 96 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><rect x="18" y="11" width="60" height="78" rx="5" fill="#EFF6FF"/><path d="M31 29h24M31 44h33M31 57h28" stroke="#75A3DC" stroke-width="4" stroke-linecap="round"/><path d="M31 72h19" stroke="#0B1250" stroke-width="4" stroke-linecap="round"/></svg>`;

/** Een telefoon die een brief fotografeert, of een pdf. De twee manieren. */
export const UPLOADBEELD = `<svg class="scene-svg" viewBox="0 0 412 240" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><ellipse cx="210" cy="222" rx="178" ry="12" fill="#B9DDD1"/><rect x="42" y="13" width="119" height="209" rx="22" fill="#102252"/><rect x="50" y="24" width="103" height="187" rx="15" fill="#F4FBF8"/><path d="M84 31h35" stroke="#102252" stroke-width="6" stroke-linecap="round"/><rect x="68" y="61" width="69" height="104" rx="3" fill="white" stroke="#9DBBD5" stroke-width="1.5"/><path d="M80 79h35M80 93h45M80 105h41M80 130h45M80 142h34" stroke="#BED1E6" stroke-width="4" stroke-linecap="round"/><rect x="77" y="112" width="40" height="8" rx="2" fill="#9BD1BD"/><path d="M61 72v-20h20M142 72v-20h-20M61 155v20h20M142 155v20h-20" stroke="#087F72" stroke-width="2.5" stroke-linecap="round"/><circle cx="101" cy="190" r="10" fill="#087F72"/><text x="205" y="127" text-anchor="middle" fill="#31516B" font-family="Figtree, sans-serif" font-size="19">of</text><path d="M260 54h82l28 29v122q0 9-9 9h-101q-9 0-9-9V63q0-9 9-9Z" fill="white" stroke="#264870" stroke-width="2.5"/><path d="M342 54v29h28" fill="#CEE2F5" stroke="#264870" stroke-width="2.5" stroke-linejoin="round"/><rect x="269" y="97" width="84" height="32" rx="5" fill="#D4EBE2"/><text x="311" y="119" text-anchor="middle" fill="#0B1250" font-family="Figtree, sans-serif" font-size="21" font-weight="800">PDF</text><path d="M271 149h78M271 163h62M271 178h73" stroke="#BED1E6" stroke-width="5" stroke-linecap="round"/></svg>`;

/** Het prijskaartje bij de gratis controle. */
export const GRATIS = `<svg class="free-art" viewBox="0 0 124 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="61" cy="58" r="47" fill="#BCE6D9"/><rect x="33" y="16" width="54" height="73" rx="4" fill="white" stroke="#164D56" stroke-width="2"/><path d="M44 33h26M44 45h32M44 57h28" stroke="#8EBDAF" stroke-width="4" stroke-linecap="round"/><circle cx="86" cy="76" r="23" fill="#E5F7F0" stroke="#087F72" stroke-width="3"/><path d="m103 93 14 14" stroke="#087F72" stroke-width="7" stroke-linecap="round"/></svg>`;

/** Een vraagteken bij de veelgestelde vragen. */
export const VRAGEN = `<svg class="faq-art" viewBox="0 0 170 150" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M27 13h99q12 0 12 12v52q0 12-12 12H64L36 111V89h-9q-12 0-12-12V25q0-12 12-12Z" fill="#DCEBFF" stroke="#5C83BB" stroke-width="2"/><path d="M72 57h73q10 0 10 10v46q0 10-10 10h-6v18l-23-18H72q-10 0-10-10V67q0-10 10-10Z" fill="#C8ECE1" stroke="#087F72" stroke-width="2"/><path d="M33 35h79M33 48h46M79 82h53M79 96h44" stroke="#5075A3" stroke-width="4" stroke-linecap="round"/></svg>`;


/**
 * De kalender bij "UWV krijgt nog twee weken".
 *
 * De termijn staat in de tekening, dus komt hij binnen als tekst en niet als
 * een getal dat hier is ingetypt. Verandert de wettelijke hersteltermijn, dan
 * verandert de tekening mee.
 *
 * @param {string} duur bijvoorbeeld '2 weken', uit dwangsom.js
 */
export function kalender(duur) {
  return `<svg class="calendar-svg" viewBox="0 0 208 177" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><rect x="22" y="21" width="164" height="139" rx="13" fill="white" stroke="#0B1250" stroke-width="2.5"/><path d="M23 37q0-15 15-15h132q15 0 15 15v27H23z" fill="#4E7EBD"/><path d="M59 13v25M148 13v25" stroke="#0B1250" stroke-width="6" stroke-linecap="round"/><text x="104" y="98" text-anchor="middle" fill="#0B1250" font-family="Figtree, sans-serif" font-size="35" font-weight="800">${veilig(duur)}</text><circle cx="51" cy="121" r="4.3" fill="#4F7ABB"/><circle cx="68" cy="121" r="4.3" fill="#4F7ABB"/><circle cx="85" cy="121" r="4.3" fill="#4F7ABB"/><circle cx="102" cy="121" r="4.3" fill="#4F7ABB"/><circle cx="119" cy="121" r="4.3" fill="#4F7ABB"/><circle cx="136" cy="121" r="4.3" fill="#4F7ABB"/><circle cx="153" cy="121" r="4.3" fill="#4F7ABB"/><circle cx="51" cy="138" r="4.3" fill="#4F7ABB"/><circle cx="68" cy="138" r="4.3" fill="#4F7ABB"/><circle cx="85" cy="138" r="4.3" fill="#4F7ABB"/><circle cx="102" cy="138" r="4.3" fill="#4F7ABB"/><circle cx="119" cy="138" r="4.3" fill="#4F7ABB"/><circle cx="136" cy="138" r="4.3" fill="#4F7ABB"/><circle cx="153" cy="138" r="4.3" fill="#4F7ABB"/></svg>`;
}

/** De omtrek van de ring hieronder: 2 * pi * r, met r = 38. */
const OMTREK = 238.76;

/**
 * De ring bij de prijs.
 *
 * Het gevulde deel is het percentage, niet een mooi ogende hoeveelheid. Zegt
 * het cijfer 20% en tekent de ring een derde, dan leest de bezoeker de ring.
 * Bij een vast bedrag is er geen deel van een geheel te tekenen; dan blijft
 * de ring leeg en staat het bedrag erin.
 *
 * @param {string} label wat er in de ring komt te staan, bijvoorbeeld '20%'
 * @param {number} deel het percentage dat de ring vult, 0 als er geen is
 */
export function prijsring(label, deel = 0) {
  const vol = Math.round((Math.max(0, Math.min(100, deel)) / 100) * OMTREK * 100) / 100;
  return `<svg class="fee-ring" viewBox="0 0 102 102" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="51" cy="51" r="38" stroke="#E9D4B1" stroke-width="10"/><circle cx="51" cy="51" r="38" stroke="#0B1250" stroke-width="10" stroke-dasharray="${vol} ${(OMTREK - vol).toFixed(2)}" transform="rotate(-90 51 51)"/><text x="51" y="58" text-anchor="middle" fill="#0B1250" font-family="Figtree,sans-serif" font-size="24" font-weight="800">${veilig(label)}</text></svg>`;
}
