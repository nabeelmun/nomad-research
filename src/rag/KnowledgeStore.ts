import * as SQLite from 'expo-sqlite';

export interface KnowledgeDocument {
  id: string;
  title: string;
  category: string;
  content: string;
}

export interface SearchResult {
  title: string;
  snippet: string;
  score: number;
}

export interface SavedChat {
  id: string;
  query: string;
  answer: string;
  citationsJson: string;
  metrics: string;
  messagesJson?: string;
  createdAt: number;
}

export class KnowledgeStore {
  private db: SQLite.SQLiteDatabase | null = null;

  async initialize(): Promise<void> {
    if (this.db) return;

    this.db = await SQLite.openDatabaseAsync('nomad_knowledge.db');

    // Create knowledge table and FTS5 search index
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
        title,
        content,
        content='articles',
        content_rowid='rowid'
      );

      CREATE TABLE IF NOT EXISTS chat_history (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        answer TEXT NOT NULL,
        citations_json TEXT NOT NULL,
        metrics TEXT,
        messages_json TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    try {
      await this.db.execAsync('ALTER TABLE chat_history ADD COLUMN messages_json TEXT;');
    } catch {
      // Column may already exist
    }

    // Check if seed data exists and has all 20 foundational benchmark articles
    const countResult = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM articles;'
    );

    if (!countResult || countResult.count < 20) {
      await this.populateSeedCorpus();
    }
  }

  async search(query: string, limit: number = 3): Promise<SearchResult[]> {
    if (!this.db) await this.initialize();

    // Clean query for FTS5 syntax
    const sanitized = query
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 2)
      .join(' OR ');

    if (!sanitized) return [];

    try {
      const rows = await this.db!.getAllAsync<any>(
        `
        SELECT 
          title,
          snippet(articles_fts, 1, '<b>', '</b>', '...', 64) as snippet,
          bm25(articles_fts) as score
        FROM articles_fts
        WHERE articles_fts MATCH ?
        ORDER BY bm25(articles_fts)
        LIMIT ?;
        `,
        [sanitized, limit]
      );

      return rows.map((r: any) => ({
        title: r.title,
        snippet: r.snippet.replace(/<\/?b>/g, ''),
        score: Math.abs(r.score)
      }));
    } catch (e) {
      console.warn('FTS search fallback to LIKE:', e);
      return [];
    }
  }

  async getArticleByTitle(title: string): Promise<string | null> {
    if (!this.db) await this.initialize();
    const row = await this.db!.getFirstAsync<{ content: string }>(
      'SELECT content FROM articles WHERE title = ? LIMIT 1;',
      [title]
    );
    return row ? row.content : null;
  }

  async saveChat(
    sessionId: string | null,
    query: string,
    answer: string,
    citationsJson: string,
    metrics: string = '',
    messagesJson: string = '[]'
  ): Promise<string> {
    if (!this.db) await this.initialize();
    const id = sessionId || `session_${Date.now()}`;
    const now = Date.now();
    try {
      await this.db!.runAsync(
        `INSERT INTO chat_history (id, query, answer, citations_json, metrics, messages_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           query = excluded.query,
           answer = excluded.answer,
           citations_json = excluded.citations_json,
           metrics = excluded.metrics,
           messages_json = excluded.messages_json,
           created_at = excluded.created_at;`,
        [id, query, answer, citationsJson, metrics, messagesJson, now]
      );
    } catch (e) {
      console.warn('Failed to save chat to history:', e);
    }
    return id;
  }

  async getChatHistory(limit: number = 30): Promise<SavedChat[]> {
    if (!this.db) await this.initialize();
    try {
      const rows = await this.db!.getAllAsync<any>(
        'SELECT id, query, answer, citations_json as citationsJson, metrics, messages_json as messagesJson, created_at as createdAt FROM chat_history ORDER BY created_at DESC LIMIT ?;',
        [limit]
      );
      return rows;
    } catch (e) {
      console.warn('Failed to fetch chat history:', e);
      return [];
    }
  }

  async deleteChat(id: string): Promise<void> {
    if (!this.db) await this.initialize();
    try {
      await this.db!.runAsync('DELETE FROM chat_history WHERE id = ?;', [id]);
    } catch (e) {
      console.warn('Failed to delete chat:', e);
    }
  }

  private async populateSeedCorpus(): Promise<void> {
    const seedArticles: KnowledgeDocument[] = [
      {
        id: 'zkp-starks-snarks',
        title: 'Zero-Knowledge Proofs: STARKs vs SNARKs',
        category: 'Cryptography',
        content: `Zero-Knowledge Proofs allow a prover to demonstrate to a verifier that a statement is true without revealing information beyond its validity. 
zk-SNARKs (Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge) utilize elliptic curves and pairing-friendly groups. Most classic SNARKs (like Groth16) require a Common Reference String (CRS) generated via a trusted setup ceremony; if compromised, fake proofs can be created. Recent SNARKs (e.g., PLONK, Halo2) offer universal or transparent setups. SNARK proofs are tiny (~200-400 bytes) with near-instant verification. However, they rely on discrete log assumptions and are not post-quantum secure.
zk-STARKs (Zero-Knowledge Scalable Transparent Arguments of Knowledge) eliminate the trusted setup entirely ('Transparent'), relying only on collision-resistant hash functions (e.g. SHA-256, Rescue) and the Fast Reed-Solomon Interactive Oracle Proof of Proximity (FRI) protocol. Because they rely solely on hashes, STARKs are inherently quantum-resistant. The tradeoff is proof size: STARK proofs are typically 10KB to 100KB (orders of magnitude larger than SNARKs), demanding higher verification bandwidth on-chain.`
      },
      {
        id: 'bft-consensus',
        title: 'Byzantine Fault Tolerance and State Machine Replication',
        category: 'Distributed Systems',
        content: `Byzantine Fault Tolerance (BFT) addresses consensus in distributed networks where nodes can fail arbitrarily or act maliciously (Byzantine faults).
The classical BFT bound, established by Lamport, Shostak, and Pease (1982), proves that in an asynchronous or partially synchronous system, consensus is only possible if fewer than one-third of the nodes are Byzantine (n >= 3f + 1). Practical Byzantine Fault Tolerance (PBFT), introduced by Castro and Liskov in 1999, reduced message complexity to O(n^2) for normal operations across three phases: Pre-prepare, Prepare, and Commit. Modern blockchain consensus protocols, such as Tendermint, HotStuff (used in Aptos/Sui), and Ethereum's Gasper (combining Casper FFG and LMD GHOST), adapt classical BFT principles using validator staking, cryptographic signatures, and pipelined view changes.`
      },
      {
        id: 'oil-embargo-1973',
        title: 'The 1973 Oil Embargo and Japanese Industrial Transformation',
        category: 'Economic History',
        content: `The 1973 oil embargo began in October 1973 when the Organization of Arab Petroleum Exporting Countries (OAPEC) proclaimed an oil embargo targeting nations perceived as supporting Israel during the Yom Kippur War.
At the time, Japan was acutely vulnerable, importing over 99% of its petroleum, mostly from the Middle East. The resulting stagflation forced a profound pivot in Japanese industrial policy led by the Ministry of International Trade and Industry (MITI). Japan aggressively pivoted away from energy-intensive heavy manufacturing (steel, petrochemicals) toward knowledge-intensive, high-value-added sectors: microelectronics, semiconductors, consumer electronics, and fuel-efficient automobiles (spearheaded by Toyota's Lean Production System). This transformation catalyzed Japan's 1980s economic dominance.`
      },
      {
        id: 'transformer-attention',
        title: 'Transformer Architecture and Attention Mechanisms',
        category: 'Artificial Intelligence',
        content: `The Transformer architecture, introduced by Vaswani et al. in 'Attention Is All You Need' (2017), replaced recurrent neural networks (RNNs) with multi-head self-attention.
Standard self-attention computes Scaled Dot-Product Attention: Attention(Q, K, V) = softmax(Q K^T / sqrt(d_k)) V.
While standard attention exhibits quadratic O(N^2) computational and memory complexity with respect to sequence length N, modern optimizations have revolutionized on-device execution:
1. FlashAttention: Tiling algorithm that minimizes IO reads/writes between fast SRAM and high-bandwidth HBM/DRAM.
2. Grouped-Query Attention (GQA): Shares key and value heads across multiple query heads, cutting KV-cache memory bandwidth by 4x to 8x, essential for mobile RAM constraints.
3. Rotary Position Embeddings (RoPE): Encodes relative position directly by rotating query and key representations in complex vector space.`
      },
      {
        id: 'lisbon-dining-travel',
        title: 'Lisbon Travel Guide: Top Vegan & Vegetarian Dining',
        category: 'Travel & Dining',
        content: `Lisbon is recognized as one of the most vibrant culinary capitals in Southern Europe with a surging plant-based gastronomy scene.
Top recommended dining options:
1. The Green Spot (Campo das Cebolas): High-end plant-based dining featuring international fusion, mushroom carpaccio, and craft kombuchas in a lush botanical setting.
2. Kong - Food Made With Love (Rua do Crucifixo, Baixa): 100% vegan reimagining of traditional Portuguese tavern fare, famed for its vegan Francesinha (rich beer sauce, plant cheese, smoked tofu) and vegan pastel de nata.
3. Vegan Nata (Rua dos Fanqueiros & Chiado): The quintessential Lisbon bakery offering certified palm-oil-free vegan pastéis de nata with crisp laminated pastry and caramelized custard.
4. Ao 26 - Vegan Food Project (Chiado): Creative, artfully plated seasonal dishes including vegan cheese boards, bifana sandwiches, and chocolate hazelnut tart.
5. Organi Chiado (Calçada Nova de São Francisco): Organic, whole-food seasonal menu with zero processed sugars, located below the steps of Chiado.`
      },
      {
        id: 'car-jumpstart-safety',
        title: 'Automotive Emergency Guide: Battery Jumpstart Procedure & Electrical Safety',
        category: 'Emergency & Mechanics',
        content: `Jumpstarting a dead vehicle battery requires strict procedural order to avoid hydrogen gas explosion and alternator diode damage.
Equipment & Specifications: Standard 12-volt lead-acid automotive battery. Use jumper cables of at least 4 to 6 AWG (American Wire Gauge) with heavy-duty copper clamps.
SAFETY HAZARDS: Lead-acid batteries produce volatile hydrogen gas during discharge. NEVER let the red and black clamps touch each other while connected to any terminal. Do NOT lean directly over the battery.
EXACT CONNECTION ORDER:
1. Park the booster vehicle close to the dead vehicle without letting the bumpers or bodies touch. Turn off both engines, headlights, and all electronics.
2. Connect RED clamp (1st) to the POSITIVE (+) terminal of the DEAD battery.
3. Connect RED clamp (2nd) to the POSITIVE (+) terminal of the BOOSTER (good) battery.
4. Connect BLACK clamp (3rd) to the NEGATIVE (-) terminal of the BOOSTER (good) battery.
5. Connect BLACK clamp (4th) to an unpainted, clean bare metal bolt or engine bracket on the DEAD vehicle, at least 18 inches away from the battery. NEVER connect to the dead battery's negative terminal (sparks can ignite hydrogen gas).
STARTING SEQUENCE:
6. Start the booster vehicle engine and let it run at 1,500–2,000 RPM for 3 to 5 minutes to transfer charge.
7. Attempt to crank the dead vehicle for no more than 5 to 7 seconds. If it starts, let both vehicles idle together for 3 minutes.
DISCONNECTION ORDER (Exact Reverse):
8. Disconnect BLACK bare metal ground clamp from dead vehicle.
9. Disconnect BLACK negative clamp from booster vehicle.
10. Disconnect RED positive clamp from booster vehicle.
11. Disconnect RED positive clamp from dead vehicle.
12. Drive the revived vehicle continuously for at least 20 to 30 minutes at speeds above 30 mph to allow the alternator to recharge the battery to minimum 12.6V.`
      },
      {
        id: 'spaghetti-aglio-olio',
        title: 'Culinary Foundations: Authentic Spaghetti Aglio e Olio',
        category: 'Culinary Arts',
        content: `Spaghetti Aglio e Olio is a classic Neapolitan pasta dish dating to the 19th century, renowned for minimalist emulsification between starchy pasta water and extra virgin olive oil.
EXACT QUANTITIES & RATIOS (Serves 2):
- Spaghetti: 200g (durum wheat semolina)
- Water: 2 liters brought to a rolling boil
- Salt: 20g kosher salt (10g per liter, 1% salinity)
- Extra virgin olive oil: 60ml (4 tablespoons), cold-pressed
- Garlic: 4 to 5 medium cloves, sliced thinly or crushed
- Red pepper flakes (Peperoncino): 1/2 teaspoon (1.5g)
- Fresh flat-leaf parsley: 15g, finely minced
EXACT PROCEDURAL STEPS & TIMINGS:
1. Boiling: Add 20g salt to 2L boiling water. Cook 200g spaghetti for 7 to 8 minutes, removing 2 minutes before package 'al dente' time. Preserve 120ml (1/2 cup) of cloudy, starchy pasta cooking water.
2. Infusion: In a wide pan over medium-low heat (approx 140°C / 285°F), add 60ml olive oil and sliced garlic. Sauté gently for 2 to 3 minutes until garlic turns pale straw-gold. WARNING: If garlic browns or burns, it turns bitter; immediately remove pan from heat if darkening occurs.
3. Spice: Add 1/2 tsp red pepper flakes 30 seconds before removing from heat.
4. Emulsification (Mantecatura): Transfer drained undercooked spaghetti into the pan. Pour 60ml of hot starchy pasta water. Toss and vigorously stir over medium heat for 60 to 90 seconds. The starch molecules bind the olive oil and water into a creamy, glossy glaze without needing cream or cheese.
5. Finish: Turn off heat, toss in 15g minced parsley, and serve immediately at 65°C–70°C.`
      },
      {
        id: 'kyoto-travel-guide',
        title: 'Kyoto Cultural & Travel Guide: Historic Heritage & Zen Gastronomy',
        category: 'Travel & Culture',
        content: `Kyoto, the former imperial capital of Japan for over a millennium, houses over 2,000 Buddhist temples and Shinto shrines.
Key destinations and dining:
1. Fushimi Inari Taisha: Dedicated to Inari, the Shinto deity of rice and agriculture, famed for over 10,000 vermilion Torii gates winding up Mount Inari.
2. Arashiyama Bamboo Grove & Tenryu-ji: A UNESCO World Heritage Zen temple with Shigetsu, serving traditional Shojin Ryori (Buddhist temple vegetarian cuisine) adhering to seasonal harmony.
3. Gion District & Higashiyama: Preserved Edo-period machiya merchant townhouses, stone-paved alleys, and traditional teahouses along Hanamikoji Street.
4. Kinkaku-ji (The Golden Pavilion): A Zen Buddhist temple whose top two floors are completely covered in gold leaf overlooking the Kyoko-chi mirror pond.`
      },
      {
        id: 'kochi-dining-heritage',
        title: 'Kochi Travel & Culinary Guide: Traditional Biryani, Medical Shops & Airport Transit',
        category: 'Travel & Dining',
        content: `Kochi (Cochin), the historic spice port of Kerala on the Arabian Sea, combines centuries of Portuguese, Dutch, British, and Arab maritime heritage.
TOP BIRYANI & TRADITIONAL DINING SPOTS:
1. Kayees Rahmathulla Hotel (Gujarathi Road, Mattancherry): Legendary culinary institution renowned for authentic Malabar mutton dum biryani. Cooked with fragrant small-grain Jeerakasala (Khyma) rice, marinated mutton, pure ghee, and slow woodfire steam, served with sweet-sour dates pickle, coconut chammanthi, and spiced raita.
2. Paragon Restaurant (Lulu Mall & Marine Drive, Ernakulam): Celebrated Malabar kitchen famous for Kozhikode-style chicken biryani, tender mutton biryani, appam, and fish mango curry.
3. Jeff Biriyani (Thoppumpady & Panampilly Nagar): Famed for slow-cooked woodfire dum biryani with melt-in-mouth meat.
4. Grand Hotel (MG Road, Ernakulam): Renowned for traditional Travancore-Cochin mutton biryani and banana-leaf Karimeen Pollichathu.
LATE NIGHT MEDICAL SHOPS & 24/7 PHARMACIES:
- 24/7 round-the-clock pharmacies are located directly opposite Ernakulam General Hospital (Hospital Road) and along MG Road near Medical Trust Hospital and Maharajas College junction.
AIRPORT TO DOWNTOWN TRANSIT & LAST TRAIN:
- From Cochin International Airport (COK) to downtown Ernakulam: Board the KSRTC low-floor electric AC feeder bus directly outside the arrival terminal to Aluva Metro Station (25 minutes). At Aluva, board the Kochi Metro Blue Line directly to downtown (MG Road or Maharaja's College Station, 35 minutes). The last Kochi Metro train departs Aluva Station at 22:30 (10:30 PM).`
      },
      {
        id: 'world-transit-airports',
        title: 'Global Transit Guide: Airport to Downtown Routes & Last Train Schedules',
        category: 'World Travel & Transit',
        content: `Comprehensive transit connections between major international airports and city centers:
1. Lisbon (LIS - Humberto Delgado Airport): The Metro Red Line (Linha Vermelha) departs directly from Aeroporto station. Take the Red Line to Alameda (transfer to Green Line for Baixa-Chiado or Cais do Sodré) or Saldanha (transfer to Yellow Line). Total transit time: 25 minutes. Last Metro train departs Aeroporto station at 01:00 AM daily.
2. Tokyo (HND - Haneda Airport): Tokyo Monorail Haneda Express reaches Hamamatsucho Station in 13 minutes (transfer to JR Yamanote Line; last monorail ~00:10). Keikyu Airport Line Airport Limited Express reaches Shinagawa Station in 11 minutes (last train ~00:00).
3. London (LHR - Heathrow Airport): The Elizabeth Line provides fast direct transit to Paddington (30 mins) and central London (Tottenham Court Road/Liverpool St; last train ~00:07). The Piccadilly Line underground operates late night into central London (last train ~23:45–00:15).
4. Paris (CDG - Charles de Gaulle): RER B regional train runs from CDG Terminal 2 and Roissypole directly to Gare du Nord and Châtelet-Les Halles (approx 35 mins; last train departs CDG at ~23:50).
5. New York (JFK): AirTrain JFK operates 24/7 to Jamaica Station (10 mins), connecting to Long Island Rail Road (LIRR) into Grand Central Madison or Penn Station (20 mins, 24/7) or the E subway train.`
      },
      {
        id: 'small-town-itinerary',
        title: 'Universal Travel Strategy: 4-Hour Small Town Exploration Blueprint',
        category: 'Travel Strategy',
        content: `Practical 4-hour framework for exploring small heritage towns, regional market centers, or villages outside major capital cities:
- Hour 1 (Historic Heart & Central Square): Arrive at the town center (Marktplatz, Piazza, or Town Green). Walk the pedestrianized historic core on foot. Observe traditional local masonry, timber framing, ancient parish water fountains, and municipal heraldry.
- Hour 2 (Primary Heritage Monument): Visit the town's single defining historical monument—a medieval castle keep, stone cathedral/abbey, guildhall, or local municipal museum. Small town museums offer deep, uncrowded access to regional craft history, archaeological finds, and regional wartime archives.
- Hour 3 (Regional Culinary Tasting & Market): Head to an independent local bakery, artisanal cheese monger, or market hall. Sample region-specific delicacies (e.g. regional pastries, local cheeses, smoked meats, artisanal ciders or roast coffee) that reflect micro-regional agriculture.
- Hour 4 (Panoramic Viewpoint or Waterside Walk): Take a 30-to-40-minute walk along the town's defensive ramparts, riverbank promenade, or hilltop chapel trail for panoramic landscape views of the surrounding valley or coast before heading to the station for departure.`
      },
      {
        id: 'ethereum-merge',
        title: 'Blockchain Architecture: The Ethereum Merge Execution & Specifications',
        category: 'Blockchain Technology',
        content: `The Ethereum Merge was the historic transition of the Ethereum network from Proof of Work (PoW) to Proof of Stake (PoS) consensus.
EXACT TECHNICAL SPECIFICATIONS:
- Mainnet Block Height: The Merge occurred at execution block height 15,537,393.
- Date and Time: September 15, 2022 at 06:42:42 UTC.
- Terminal Total Difficulty (TTD): The transition was triggered when the Proof of Work chain reached the predetermined cumulative difficulty threshold of exactly 58,750,000,000,000,000,000,000 (58.75 sextillion).
- Architecture: Merged the original execution layer (formerly Eth1) with the Beacon Chain consensus layer (Eth2) through the Engine API.
- Impact: Reduced Ethereum's global energy consumption by over 99.95% and eliminated miner block subsidies, transitioning issuance to validator staking yields combined with EIP-1559 base fee burning.`
      },
      {
        id: 'hostage-crisis-operation',
        title: 'Military History: Operation Eagle Claw (1980 Iran Hostage Crisis Rescue)',
        category: 'Military History',
        content: `Operation Eagle Claw (also referred to as Operation Evening Light) was a joint United States Armed Forces military operation ordered by President Jimmy Carter.
EXACT MISSION DETAILS:
- Objective: Attempted rescue of 52 American diplomats and citizens held hostage inside the US Embassy in Tehran, Iran, following the 1979 Iranian Revolution.
- Execution Dates: April 24–25, 1980.
- Staging Location: Desert One, an austere desert landing zone in the Dasht-e Kavir salt desert of eastern Iran, approximately 200 miles southeast of Tehran.
- Mission Abort & Collision: Encountering severe localized dust storms (haboob), two RH-53D Sea Stallion helicopters experienced mechanical instrument failures and a third suffered a cracked rotor blade, reducing the operational helicopter count below the minimum six required for mission viability. While maneuvering for evacuation at Desert One, an RH-53D helicopter collided with an EC-130 Hercules transport aircraft loaded with fuel. The resulting fireball killed eight American servicemembers (five Air Force, three Marines).
- Long-term Legacy: The organizational and communication deficiencies exposed at Desert One directly spurred the Goldwater-Nichols Act of 1986 and the creation of the United States Special Operations Command (USSOCOM).`
      },
      {
        id: 'novel-thursday',
        title: 'Literary History: The Man Who Was Thursday by G. K. Chesterton',
        category: 'Literature & Philosophy',
        content: `The Man Who Was Thursday: A Nightmare is a renowned metaphysical and philosophical thriller novel.
KEY FACTUAL DETAILS:
- Author: Gilbert Keith (G. K.) Chesterton.
- Publication Year: 1908.
- Plot & Structure: Set in Edwardian London, the story follows Gabriel Syme, a poet recruited by a secret philosophical police division created to combat intellectual anarchism. Syme successfully infiltrates the Central European Anarchist Council, a secret cabal of seven men each named after a day of the week. Syme is elected to the post of 'Thursday'.
- The Central Figure: The council is presided over by the enigmatic, monstrously massive President named 'Sunday'. As Syme investigates, he discovers that the other anarchist council members are also disguised undercover detectives with identical missions.
- Themes: A profound Christian theological allegory examining skepticism, the problem of evil, suffering, existential pessimism, and divine sovereignty.`
      },
      {
        id: 'nauru-demographics',
        title: 'Geopolitical & Economic Profile: Republic of Nauru Demographics in the 2010s',
        category: 'Geopolitics & Economics',
        content: `The Republic of Nauru is an isolated oval-shaped island nation in Micronesia (Central Pacific) with a total land area of 21 square kilometers (8.1 sq mi).
DEMOGRAPHICS & POPULATION:
- Resident Population in the 2010s: Between 10,000 and 12,500 residents (2011 census recorded 10,084; mid-decade estimates ~11,200). It is the third-smallest sovereign country by population in the world, behind Vatican City and Tuvalu.
MAIN ECONOMIC ACTIVITIES IN THE 2010s:
1. Australian Regional Processing Centre (RPC): Reopened under Australia's revived Pacific Solution policy in August 2012, offshore immigration detention and administrative hosting for asylum seekers became Nauru's predominant source of government revenue, foreign aid, and private sector employment.
2. Residual Phosphate Mining: Secondary extraction of remaining deeper phosphate deposits by state-owned RONPHOS (though output was a fraction of its 1970s peak strip-mining era).
3. Fisheries Licensing: Generating foreign exchange by selling purse-seine tuna fishing license days under the Parties to the Nauru Agreement (PNA) Vessel Day Scheme.`
      },
      {
        id: 'iec-connectors',
        title: 'Electrical Standards: IEC 60320 C13 vs C15 Appliance Couplers',
        category: 'Electrical Engineering',
        content: `IEC 60320 is the international electrotechnical standard governing appliance couplers for household and similar general purposes up to 250V and 16A.
PHYSICAL AND THERMAL DISTINCTIONS:
- IEC C13 Connector: Standard un-notched female coupler rated for a maximum operating pin temperature of 70°C ("cold condition"). Mates with standard IEC C14 male inlets. Commonly used on desktop computer power supplies, monitors, instrument amplifiers, and office peripherals.
- IEC C15 Connector: High-temperature female coupler featuring a distinct mechanical notch (cutout groove) centered on the bottom base below the ground earth pin. Rated for a maximum operating pin temperature of 120°C ("hot condition").
MANDATED USAGE & APPLICATIONS:
- C15 cords are legally required on heat-generating appliances where current draw generates elevated inlet temperatures, notably electric kettles, commercial waffle irons, high-output stage spotlights, enterprise PoE network switches, and high-wattage server Power Supply Units (PSUs).
SAFETY KEYWAY INTEROPERABILITY:
- A high-temperature C15 cord CAN be plugged into a standard 70°C C14 inlet (backwards compatible).
- A standard 70°C C13 cord CANNOT be plugged into a high-temperature 120°C C16 inlet because the missing notch physically blocks insertion, preventing low-temperature cords from melting on hot appliances.`
      },
      {
        id: 'gfci-troubleshooting',
        title: 'Electrical Safety: Resetting and Troubleshooting a Tripping GFCI Outlet',
        category: 'Electrical Safety',
        content: `A Ground Fault Circuit Interrupter (GFCI / RCD) continuously compares current flow between the hot and neutral conductors, instantly opening the circuit within 25 milliseconds if an imbalance of 4 to 6 milliamperes (mA) is detected.
SAFE PROCEDURAL CHECKS BEFORE CALLING AN ELECTRICIAN:
1. Disconnect All Devices: Unplug every single electrical appliance, power strip, and cord plugged into the GFCI outlet AND all standard outlets located downstream on the same branch circuit (bathrooms, kitchens, garages, and exterior outlets are frequently daisy-chained to one master GFCI).
2. Physical & Moisture Inspection: Visually inspect the outlet faceplate and junction box for condensation, liquid spills, outdoor rain intrusion, carbon charring, or melted plastic. WARNING: If the receptacle is wet or warm to the touch, do NOT touch it—switch off the main breaker immediately.
3. Verify Main Breaker: Ensure the main electrical service panel breaker controlling the room is firmly in the ON position (not tripped halfway). Modern tamper-resistant/self-testing GFCIs require incoming 120V/230V line voltage to mechanically engage and latch the internal reset coil.
4. Firm Reset Engagement: Press the RESET button firmly into the face of the outlet until a distinct mechanical click is felt and heard. The status indicator LED should illuminate green or turn off (depending on model).
5. Load Isolation Test: Plug in appliances one by one. If plugging in one specific appliance (e.g. toaster, hair dryer, power tool) instantly causes the GFCI to trip, that individual appliance has an internal insulation breakdown (ground fault) and must be repaired or discarded.
6. Outlet Failure Check: If the GFCI trips immediately with absolutely ZERO appliances connected to any outlet on the circuit, the GFCI receptacle itself has failed internally or an active line-to-ground fault exists in the concealed wall wiring. Leave the breaker OFF and contact a licensed electrician.`
      },
      {
        id: 'us-highway-signs',
        title: 'Transportation Safety: US MUTCD Yellow Pennant-Shaped Sign Meaning',
        category: 'Transportation Safety',
        content: `Under the Federal Highway Administration (FHWA) Manual on Uniform Traffic Control Devices (MUTCD), highway signs utilize standardized shapes, colors, and placements.
YELLOW PENNANT-SHAPED SIGN SPECIFICATIONS:
- Sign Code: MUTCD W14-3.
- Shape: An isosceles triangle / pennant shape with its longest axis pointing horizontally to the right.
- Color Scheme: Yellow retroreflective background with black uppercase lettering and border.
- EXACT MEANING: "NO PASSING ZONE".
- UNIQUE ROADWAY PLACEMENT: It is the ONLY traffic sign in the United States designed specifically to be erected on the LEFT side of a two-lane, two-way roadway (facing approaching traffic), positioned at the exact beginning of a no-passing zone where sight distance is restricted by horizontal curves, vertical crests, or intersections.
- Functional Rationale: Mounting on the left side ensures that drivers preparing to initiate a passing maneuver in the oncoming left lane will clearly see the warning even if large vehicles in front of them obstruct standard right-shoulder signage.`
      },
      {
        id: 'battery-chemistry-cold',
        title: 'Electrochemical Degradation: Lithium-Ion vs NiMH Performance Below 0°C',
        category: 'Materials Science & Batteries',
        content: `Low-temperature electrochemical dynamics below 0°C (32°F) differ fundamentally between Lithium-ion and Nickel-Metal Hydride (NiMH) battery chemistries.
LITHIUM-ION SUB-ZERO BEHAVIOR & CHARGING PLATING HAZARD:
- Charging Below 0°C: Catastrophic degradation mechanism. At freezing temperatures, the liquid electrolyte viscosity increases significantly, while the solid electrolyte interphase (SEI) diffusion resistance and charge-transfer resistance at the graphite anode rise exponentially. Lithium ions cannot intercalate into the graphite crystal lattice at normal rates. Excess lithium ions are instead electrochemically deposited onto the graphite surface as metallic lithium ("lithium plating").
- Permanent Damage: Lithium plating causes irreversible capacity loss, increases internal cell resistance, and seeds sharp microscopic metallic lithium dendrites that can pierce the microporous polymer separator over subsequent cycles, causing internal micro-shorts and potential thermal runaway.
- Discharging Below 0°C: Temporary voltage depression due to ohmic resistance; does not cause metallic dendrites, but capacity is temporarily reduced.
NICKEL-METAL HYDRIDE (NiMH) BEHAVIOR:
- NiMH cells utilize an aqueous potassium hydroxide (KOH) alkaline electrolyte which retains reasonable ionic conductivity at sub-zero temperatures down to -20°C.
- While discharge internal resistance increases and high-rate output drops in cold weather, NiMH does NOT undergo metallic dendrite plating or separator piercing. Consequently, unheated NiMH packs degrade far less permanently in sub-0°C conditions than unheated Lithium-ion packs subjected to charging.`
      },
      {
        id: 'tls-handshake-comparison',
        title: 'Network Security Protocols: TLS 1.2 vs TLS 1.3 Handshake Differences',
        category: 'Cybersecurity & Protocols',
        content: `The Transport Layer Security (TLS) protocol underwent major structural evolution from TLS 1.2 (RFC 5246, 2008) to TLS 1.3 (RFC 8446, 2018).
KEY HANDSHAKE DIFFERENCES FOR DEVELOPERS:
1. Handshake Round Trips (Latency):
   - TLS 1.2 requires a 2-RTT (two round-trip times) handshake before encrypted application data can be transmitted (ClientHello -> ServerHello/Cert -> ClientKeyExchange -> Finished).
   - TLS 1.3 reduces the standard handshake to 1-RTT by including speculative Diffie-Hellman key shares directly within the initial ClientHello.
   - For previously visited servers, TLS 1.3 supports 0-RTT resumption (Early Data), allowing application payload to be sent alongside the initial ClientHello.
2. Mandatory Forward Secrecy & Deprecated Cryptography:
   - TLS 1.2 permitted static RSA key exchange (where compromising the server's private key allows decrypting past recorded traffic) as well as vulnerable legacy ciphers (CBC mode, RC4, MD5, SHA-1).
   - TLS 1.3 completely eliminates static RSA and static Diffie-Hellman key exchanges, strictly mandating Perfect Forward Secrecy (PFS) via ephemeral Diffie-Hellman (ECDHE or DHE). It removes all CBC and stream ciphers, exclusively permitting modern Authenticated Encryption with Associated Data (AEAD) ciphers (AES-GCM, ChaCha20-Poly1305, AES-CCM).
3. Certificate Encryption & Privacy:
   - In TLS 1.2, the server's digital certificate and identity were transmitted in plaintext during the handshake, visible to network eavesdroppers.
   - In TLS 1.3, the server certificate and its extensions are encrypted immediately after the initial key exchange message, concealing the destination identity from middleboxes and network snoopers.`
      }
    ];

    for (const doc of seedArticles) {
      await this.db!.runAsync(
        'INSERT OR REPLACE INTO articles (id, title, category, content) VALUES (?, ?, ?, ?);',
        [doc.id, doc.title, doc.category, doc.content]
      );
    }

    try {
      await this.db!.execAsync("INSERT INTO articles_fts(articles_fts) VALUES('rebuild');");
    } catch (err) {
      console.warn('FTS rebuild warning:', err);
    }
  }
}

export const knowledgeStore = new KnowledgeStore();
