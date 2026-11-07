/**
 * When each card's functional errata reached the TCG, for the cards EDOPro keeps a pre-errata
 * version of. Before that date a duel plays the card as originally printed, and the app shows
 * that text; from it on, the errata'd card.
 *
 * Read from each card's Yugipedia "Card Errata" page (7 November 2026): the date is the TCG release
 * of the first printing whose text changed what the card does (wording-only updates don't count).
 * `null`: the functional errata came after the app's August 2017 cutoff, so the original holds for
 * the whole timeline. A card missing here keeps today's text: its pre-errata version is not used
 * until someone checks it (REVIEW below lists why).
 */
export const ERRATA_DATES: Record<string, { until: string | null; source: string }> = {
    Sangan: { until: '2016-09-15', source: 'DPRP-EN038 (Duelist Pack: Rivals of the Pharaoh)' },
    'Witch of the Black Forest': { until: '2017-07-06', source: 'BLLR-EN046 (Battles of Legend: Light\'s Revenge)' },
    'Dark Magician of Chaos': { until: '2015-11-12', source: 'YGLD-ENC02 (Yugi\'s Legendary Decks)' },
    'Crush Card Virus': { until: '2015-03-19', source: 'PGL2-EN070 (Premium Gold: Return of the Bling)' },
    'Exchange of the Spirit': { until: '2015-03-19', source: 'PGL2-EN066 (Premium Gold: Return of the Bling)' },
    'Sinister Serpent': { until: '2015-03-19', source: 'PGL2-EN027 (Premium Gold: Return of the Bling)' },
    'Ring of Destruction': { until: '2015-03-19', source: 'PGL2-EN063 (Premium Gold: Return of the Bling)' },
    'Temple of the Kings': { until: '2015-03-19', source: 'PGL2-EN056 (Premium Gold: Return of the Bling)' },
    'Twin-Headed Behemoth': { until: '2015-10-23', source: 'AP08-EN016 (Astral Pack Eight)' },
    'Catapult Turtle': { until: '2014-06-27', source: 'DL18-EN001 (Duelist League 18)' },
    'Dark Strike Fighter': { until: '2014-10-23', source: 'LC5D-EN234 (Legendary Collection 5D\'s)' },
    'Night Assailant': { until: '2010-09-25', source: 'DT03-EN056 (Duel Terminal 3)' },
    'Dragon Seeker': { until: '2005-07-27', source: 'DB2-EN101 (Dark Beginning 2)' },
    'Spiritual Energy Settle Machine': { until: '2005-07-27', source: 'DB2-EN191 (Dark Beginning 2)' },
    'Stronghold the Moving Fortress': { until: '2009-07-07', source: 'DPYG-EN030 (Duelist Pack: Yugi)' },
    'Ryko, Lightsworn Hunter': { until: '2014-06-27', source: 'SDLI-EN015 (Realm of Light Structure Deck)' },
    'Wulf, Lightsworn Beast': { until: '2014-06-27', source: 'SDLI-EN010 (Realm of Light Structure Deck)' },
    'Ultimate Tyranno': { until: '2017-04-13', source: 'SR04-EN006 (Dinosmasher\'s Fury Structure Deck)' },
    'Goyo Guardian': { until: '2017-03-30', source: 'DUSA-EN075 (Duelist Saga)' },
    'Imperial Order': { until: '2017-03-30', source: 'DUSA-EN049 (Duelist Saga)' },
    'Brionac, Dragon of the Ice Barrier': { until: '2017-03-30', source: 'DUSA-EN073 (Duelist Saga)' },
    'Brain Control': { until: '2017-03-30', source: 'DUSA-EN046 (Duelist Saga)' },
    'Rescue Cat': { until: '2017-03-30', source: 'DUSA-EN072 (Duelist Saga)' },
    'Future Fusion': { until: '2017-03-30', source: 'DUSA-EN062 (Duelist Saga)' },
    'Cipher Soldier': { until: '2007-09-06', source: 'CP04-EN010 (Champion Pack: Game Four)' },
    'Y-Dragon Head': { until: '2016-10-20', source: 'SDKS-EN006 (Seto Kaiba Structure Deck)' },
    'Z-Metal Tank': { until: '2016-10-20', source: 'SDKS-EN007 (Seto Kaiba Structure Deck)' },
    'Heavy Mech Support Platform': { until: '2016-10-20', source: 'SDKS-EN008 (Seto Kaiba Structure Deck)' },
    'Mermail Abyssteus': { until: '2017-07-06', source: 'BLLR-EN051 (Battles of Legend: Light\'s Revenge)' },
    // Errata'd after the cutoff: the original holds through the whole timeline.
    'Makyura the Destructor': { until: null, source: 'LED7-EN008 (2020)' },
    'Destiny HERO - Disk Commander': { until: null, source: 'LEHD-ENA08 (2018)' },
    'Grandsoil the Elemental Lord': { until: null, source: 'FLOD-ENSE1 (2018)' },
    'Dewloren, Tiger King of the Ice Barrier': { until: null, source: 'SDFC-EN042 (2021)' },
    'Imperial Custom': { until: null, source: 'SDSA-EN038 (2020)' },
    'Senet Switch': { until: null, source: 'TAMA-EN042 (2022)' },
    'Performage Plushfire': { until: null, source: 'OP27-EN013 (2025)' },
    'Clear World': { until: null, source: 'MZTM-EN098 (2025)' },
    'Ancient Fairy Dragon': { until: null, source: 'MAZE-EN050 (2023)' },
    'Cyber Blader': { until: null, source: 'SGX1-ENE21 (2022)' },
};

/** Pre-errata versions not used yet, and why: their errata date needs a closer look. */
export const ERRATA_REVIEW: Record<string, string> = {
    'Chaos Emperor Dragon - Envoy of the End': 'errata first seen on JUMP-EN086, whose date is unclear',
    'Elder Entity Norden': 'only a late printing (UP02) differs; check the TCG announcement',
    'Mind Master': 'only a late printing (UP02) differs; check the TCG announcement',
    Gilasaurus: 'changes on BP01 (2012) and SR04 (2017); which one is functional?',
    'Emissary of the Afterlife': 'a 2005 change ("their") may be wording only',
    Necrovalley: 'functional changes on LCYW (2012) and DUSA (2017)',
    'Swords of Concealing Light': 'changes on SD5 (2005) and SR04 (2017)',
    'Mind Crush': 'changes on CP08 (2009) and SDGU (2011)',
    'Amazoness Fighter': 'a 2010 change may be wording only',
    'Toon World': 'the activation cost wording changed several times',
    'Blue-Eyes Ultimate Dragon': 'the errata table shows only stat captions',
    Recycle: 'only a 2005 wording change is listed',
    'Splendid Venus': 'changes on BP02 (2013) and SR05 (2018)',
    'W-Wing Catapult': 'Union errata reached its siblings in 2016; it was only reprinted in 2018',
    'Armored Cybern': 'changes on SDCR (2014) and LEDD (2017-10)',
    'Alien Infiltrator': 'no text change listed (the difference may be a ruling)',
    'Rampaging Rhynos': 'no text change listed (the difference may be a ruling)',
    'Storm Shooter': 'no text change listed (the difference may be a ruling)',
    'Gandora-X the Dragon of Demolition': 'no errata table on Yugipedia',
};

/**
 * GOAT format versions: how these cards read and worked in the TCG of April to September 2005.
 * They're used for sets released before the format's end, the closest the engine gets to those years.
 */
export const GOAT_UNTIL = '2005-10-01';
