    const DIRECTIONS = {
    North: { dx: 0, dy: -1 },
    South: { dx: 0, dy: 1 },
    East: { dx: 1, dy: 0 },
    West: { dx: -1, dy: 0 },
    };

    let G = null;
    let PENDING_NAMED_GRID = null;
    let NAMING_PROMPT_CACHE = null;
    let AI_CONTEXT = {
    theme: '',
    characterDesc: ''
    };

    function toggleDebug() {
    const div = document.getElementById('debug-names');
    if (div.style.display === 'none') {
        div.style.display = 'block';
        document.getElementById('btn-debug').textContent = 'Hide Generated Names';
    } else {
        div.style.display = 'none';
        document.getElementById('btn-debug').textContent = 'Show Generated Names';
    }
    }

    function getNamingPromptInputs() {
    return {
        theme: document.getElementById('game-theme').value.trim(),
        curseTypes: document.getElementById('game-curse-types').value.trim(),
        charDesc: document.getElementById('game-char-desc').value.trim(),
    };
    }

    function getNamingPromptSignature(inputs) {
    return JSON.stringify(inputs);
    }

    function buildCachedNamingRequest(inputs = getNamingPromptInputs()) {
    const signature = getNamingPromptSignature(inputs);
    if (NAMING_PROMPT_CACHE && NAMING_PROMPT_CACHE.signature === signature) {
        return NAMING_PROMPT_CACHE;
    }

    const grid = generateGrid();
    const manifest = buildNamingManifest(grid);
    const prompt = buildGridNamingPrompt(inputs.theme, inputs.curseTypes, inputs.charDesc, manifest);
    NAMING_PROMPT_CACHE = { signature, grid, manifest, prompt };
    return NAMING_PROMPT_CACHE;
    }

    function togglePromptDebug() {
    const div = document.getElementById('debug-prompt');
    const button = document.getElementById('btn-debug-prompt');
    const statusDiv = document.getElementById('ai-status');

    if (div.style.display !== 'none') {
        div.style.display = 'none';
        button.textContent = 'Show AI Prompt';
        return;
    }

    const inputs = getNamingPromptInputs();
    if (!inputs.theme) {
        statusDiv.innerHTML = '<span class="danger-txt">Theme is required to build the AI prompt.</span>';
        return;
    }

    const request = buildCachedNamingRequest(inputs);
    div.value = request.prompt;
    div.style.display = 'block';
    button.textContent = 'Hide AI Prompt';
    statusDiv.innerHTML = '<span class="info-txt">This is the exact prompt that will be sent by the next map generation, unless you edit the setup fields.</span>';
    }

    function initState(className) {
    const base = CLASSES[className];
    let grid;
    if (PENDING_NAMED_GRID) {
        grid = cloneGridForPlay(PENDING_NAMED_GRID);
        PENDING_NAMED_GRID = null;
    } else {
        grid = generateGrid();
        fillDefaultNames(grid);
    }
    G = {
        player: {
        hp: 10,
        level: 1,
        class: className,
        base: { power: base.power, perception: base.perception, persuasion: base.persuasion },
        statuses: [],
        inventory: [],
        physicalDescription: AI_CONTEXT.characterDesc || `A ${className} adventurer.`,
        physicalDescriptionLoading: false,
        pos: { x: grid.start.x, y: grid.start.y },
        },
        grid,
        phase: 'playing',
        turns: 0,
        pendingResolveFn: null,
        canFlee: false,
        encounterType: null,
        fleeCooldown: false
    };
    }

    function rollD(n) { return Math.floor(Math.random() * n) + 1; }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function getEff() {
    const p = G.player;
    const e = { power: p.base.power, perception: p.base.perception, persuasion: p.base.persuasion };
    for (const s of p.statuses) e[s.attribute] += s.magnitude;
    for (const item of p.inventory) {
        if (item.type === 'buff' && item.equipped) e[item.attribute] += item.magnitude;
    }
    return e;
    }

    function getPlayerContext() {
    const p = G.player;
    let ctx = '';
    if (AI_CONTEXT.characterDesc) {
        ctx += `Character: ${AI_CONTEXT.characterDesc}. `;
    }
    const equippedItems = p.inventory.filter(item => item.type === 'buff' && item.equipped);
    if (equippedItems.length > 0) {
        ctx += `Equipped Items: ${equippedItems.map(e => e.name).join(', ')}. `;
    }
    if (p.statuses.length > 0) {
        ctx += `Curses: ${p.statuses.map(s => s.name).join(', ')}.`;
    }
    return ctx.trim();
    }

    function getEquippedItems() {
    return G.player.inventory.filter(item => item.type === 'buff' && item.equipped);
    }

    function escapeHtmlText(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
    }

    function renderCharacterDescription() {
    const div = document.getElementById('character-description');
    if (!div || !G) return;
    const description = escapeHtmlText(G.player.physicalDescription || 'No physical description recorded yet.');
    const loading = G.player.physicalDescriptionLoading
        ? '<div class="runtime-api-note" style="margin-top:6px;">Updating appearance...</div>'
        : '';
    div.innerHTML = `${description}${loading}`;
    }

    function toggleCharacterDescription() {
    const div = document.getElementById('character-description');
    const button = document.getElementById('btn-character-description');
    if (!div || !button) return;

    if (div.style.display === 'block') {
        div.style.display = 'none';
        button.textContent = 'Show Appearance';
        return;
    }

    renderCharacterDescription();
    div.style.display = 'block';
    button.textContent = 'Hide Appearance';
    }

    async function refreshPhysicalDescription(change) {
    if (!G) return;
    const p = G.player;
    const prompt = buildPhysicalDescriptionPrompt({
        theme: AI_CONTEXT.theme,
        characterDesc: AI_CONTEXT.characterDesc,
        className: p.class,
        currentDescription: p.physicalDescription,
        change,
        equippedItems: getEquippedItems(),
        curses: p.statuses,
    });

    p.physicalDescriptionLoading = true;
    renderCharacterDescription();
    const description = await generatePhysicalDescription(prompt);
    p.physicalDescriptionLoading = false;
    if (description && String(description).trim()) {
        p.physicalDescription = String(description).trim();
    }
    renderCharacterDescription();
    }

    function rollItemData() {
    if (Math.random() < CURSE_CLEAR_ITEM_CHANCE) {
        return { type: 'curseClear', name: '' };
    }
    return {
        type: 'buff',
        attribute: pick(['power', 'perception', 'persuasion']),
        magnitude: rollD(5),
        name: '',
    };
    }

    function itemDescription(item) {
    if (item.type === 'curseClear') return 'Removes one curse';
    return `+${item.magnitude} ${item.attribute}`;
    }

    function addItemFixed(itemData, legacyAttribute, legacyMagnitude) {
    const source = typeof itemData === 'object' && itemData
        ? itemData
        : { type: 'buff', name: itemData, attribute: legacyAttribute, magnitude: legacyMagnitude };
    const type = source.type === 'curseClear' ? 'curseClear' : 'buff';
    if (type === 'curseClear') {
        const finalName = source.name && String(source.name).trim()
        ? String(source.name).trim()
        : pick(CURSE_CLEAR_ITEM_NAMES);
        const item = { type, name: finalName };
        G.player.inventory.push(item);
        return item;
    }

    const attribute = source.attribute || pick(['power', 'perception', 'persuasion']);
    const magnitude = Math.max(1, Math.min(5, Number(source.magnitude) || 1));
    const strength = magnitude <= 2 ? 'Weak' : 'Strong';
    const fallbackPool = ITEM_NAMES[attribute][strength];
    const finalName = source.name && String(source.name).trim()
        ? String(source.name).trim()
        : pick(fallbackPool.length ? fallbackPool : ITEM_NAMES[attribute].Strong);
    const item = { type, name: finalName, attribute, magnitude, equipped: false };
    G.player.inventory.push(item);
    return item;
    }

    function pickFallbackCurseName(attribute, magnitude) {
    const pool = NEGATIVE_STATUS_POOL.filter(s => s.attribute === attribute && s.magnitude === magnitude);
    const alt = NEGATIVE_STATUS_POOL.filter(s => s.magnitude === magnitude);
    const src = pool.length ? pool : (alt.length ? alt : NEGATIVE_STATUS_POOL);
    return pick(src).name;
    }

    function applyCurseFromEncounter(data) {
    const fc = data.failCurse;
    const raw = data.failCurseName && String(data.failCurseName).trim();
    const name = raw || pickFallbackCurseName(fc.attribute, fc.magnitude);
    const s = { name, attribute: fc.attribute, magnitude: fc.magnitude };
    G.player.statuses.push(s);
    return s;
    }

    function damage(n) {
    G.player.hp = Math.max(0, G.player.hp - n);
    }

    async function checkGameOver() {
    if (G.phase.startsWith('gameover')) return true;

    let reason = null;
    if (G.player.hp <= 0) reason = 'hp';
    else {
        const eff = getEff();
        for (const attr of ['power', 'perception', 'persuasion']) {
        if (eff[attr] <= 0) {
            reason = attr;
            break;
        }
        }
    }

    if (reason) {
        G.phase = 'loading';
        renderInputPanel();

        let reasonText = '';
        if (reason === 'hp') reasonText = 'You have succumbed to your wounds (0 HP).';
        else reasonText = `Your ${reason} has dropped to 0 or below due to curses.`;

        addLog(`<span class="danger-txt">☠ ${reasonText} You have perished in the dungeon.</span>`, 'event-loss');
        addLog(`<span class="info-txt">The narrator is thinking...</span>`, 'event-neutral');

        const prompt = buildGameOverPrompt(reasonText, getPlayerContext());
        const narration = await generateNarration(AI_CONTEXT, prompt);

        const logDiv = document.getElementById('log');
        if (logDiv.lastChild) logDiv.removeChild(logDiv.lastChild);

        if (narration) addLog(narration, 'event-loss');

        G.phase = 'gameover-loss';
        renderUI();
        return true;
    }
    return false;
    }

    function levelUp() {
    if (G.player.level < MAX_LEVEL) {
        G.player.level++;
        G.phase = 'levelup';
    }
    }

    function isReachable(cells, sx, sy, ex, ey) {
    const W = cells[0].length;
    const H = cells.length;
    const seen = Array.from({ length: H }, () => Array(W).fill(false));
    const queue = [[sx, sy]];
    seen[sy][sx] = true;
    while (queue.length) {
        const [x, y] = queue.shift();
        if (x === ex && y === ey) return true;
        for (const { dx, dy } of Object.values(DIRECTIONS)) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (seen[ny][nx] || cells[ny][nx].type === 'wall') continue;
        seen[ny][nx] = true;
        queue.push([nx, ny]);
        }
    }
    return false;
    }

    function generateGrid() {
    const W = GRID_WIDTH;
    const H = GRID_HEIGHT;
    const startX = Math.floor(W / 2);
    const startY = Math.floor(H / 2);
    const wallN = Math.floor(W * H * WALL_RATIO);

    for (let attempt = 0; attempt < GRID_GEN_MAX_ATTEMPTS; attempt++) {
        const cells = Array.from({ length: H }, () =>
        Array.from({ length: W }, () =>
            ({ type: null, data: {}, visited: false, fled: false })));

        const positions = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (!(x === startX && y === startY)) positions.push({ x, y });

        for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
        }

        for (let i = 0; i < wallN; i++)
        cells[positions[i].y][positions[i].x].type = 'wall';

        const open = positions.slice(wallN);
        const upperThirdLimit = Math.ceil(H / 3);
        // const validExits = open.filter(p => p.y < upperThirdLimit);
        const validExits = open.filter(p => 
        p.x === 0 || 
        p.y === 0 || 
        p.x === W - 1 || 
        p.y === H - 1
        );
        const finalValidExits = validExits.length ? validExits : open;
        // if (!validExits.length) continue;
        // const exitPos = validExits[Math.floor(Math.random() * validExits.length)];
        // cells[exitPos.y][exitPos.x].type = 'exit';
        if (!finalValidExits.length) continue;
        const exitPos = finalValidExits[Math.floor(Math.random() * finalValidExits.length)];
        cells[exitPos.y][exitPos.x].type = 'exit';

        // if (!isReachable(cells, startX, startY, exitPos.x, exitPos.y)) continue;
        if (!isReachable(cells, startX, startY, exitPos.x, exitPos.y)) continue;

        cells[startY][startX].type = 'start';
        cells[startY][startX].visited = true;

        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (cells[y][x].type) continue;
        const t = pick(ENCOUNTER_TYPES);
        cells[y][x].type = t;
        const diff = rollDifficultyByDistance(x, y, exitPos.x, exitPos.y);
        if (t === 'enemy') {
            const failAttr = pick(['power', 'perception', 'persuasion']);
            cells[y][x].data = {
            power: diff,
            failCurse: { attribute: failAttr, magnitude: -1 },
            name: '',
            failCurseName: '',
            };
        } else if (t === 'treasure') {
            const failMag = rollD(2);
            const failAttr = pick(['power', 'perception', 'persuasion']);
            cells[y][x].data = {
            difficulty: diff,
            failCurse: { attribute: failAttr, magnitude: -failMag },
            trapName: '',
            failCurseName: '',
            rewardItem: rollItemData(),
            };
        } else if (t === 'npc') {
            const failAttr = pick(['power', 'perception', 'persuasion']);
            cells[y][x].data = {
            check: diff,
            failCurse: { attribute: failAttr, magnitude: -2 },
            name: '',
            failCurseName: '',
            rewardItem: rollItemData(),
            };
        } else if (t === 'item') {
            cells[y][x].data = {
            pickup: rollItemData(),
            };
        }
        }

        return { cells, exit: exitPos, start: { x: startX, y: startY } };
    }
    throw new Error(`Map generation failed after ${GRID_GEN_MAX_ATTEMPTS} attempts.`);
    }

    function cloneGridForPlay(grid) {
    const g = JSON.parse(JSON.stringify(grid));
    for (let y = 0; y < GRID_HEIGHT; y++) for (let x = 0; x < GRID_WIDTH; x++) {
        const c = g.cells[y][x];
        c.visited = c.type === 'start';
        c.fled = false;
    }
    return g;
    }

    function fillDefaultItemName(item) {
    if (!item) return;
    if (item.type === 'curseClear') {
        if (!item.name) item.name = pick(CURSE_CLEAR_ITEM_NAMES);
        return;
    }

    item.type = 'buff';
    if (!item.attribute) item.attribute = pick(['power', 'perception', 'persuasion']);
    item.magnitude = Math.max(1, Math.min(5, Number(item.magnitude) || 1));
    const strength = item.magnitude <= 2 ? 'Weak' : 'Strong';
    if (!item.name) {
        item.name = pick(ITEM_NAMES[item.attribute][strength]);
    }
    }

    function fillDefaultNames(grid) {
    for (let y = 0; y < GRID_HEIGHT; y++) for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = grid.cells[y][x];
        const t = cell.type;
        const d = cell.data;
        if (t === 'enemy') {
        const cat = getDifficultyCategory(d.power);
        if (!d.name) d.name = pick(ENEMY_NAMES[cat]);
        } else if (t === 'treasure') {
        const cat = getDifficultyCategory(d.difficulty);
        if (!d.trapName) d.trapName = pick(TRAP_NAMES[cat]);
        fillDefaultItemName(d.rewardItem);
        } else if (t === 'npc') {
        const cat = getDifficultyCategory(d.check);
        if (!d.name) d.name = pick(NPC_NAMES[cat]);
        fillDefaultItemName(d.rewardItem);
        } else if (t === 'item' && d.pickup) {
        fillDefaultItemName(d.pickup);
        }
    }
    }

    function buildNamingManifest(grid) {
    const slots = [];
    let slotIndex = 0;
    for (let y = 0; y < GRID_HEIGHT; y++) for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = grid.cells[y][x];
        const t = cell.type;
        if (!t || t === 'wall' || t === 'start' || t === 'exit') continue;
        const d = cell.data;
        if (t === 'enemy') {
        slots.push({
            slotIndex: slotIndex++,
            x,
            y,
            encounterType: 'enemy',
            difficultyTier: getDifficultyCategory(d.power),
            powerNumeric: d.power,
            curseOnFailure: { attribute: d.failCurse.attribute, magnitude: d.failCurse.magnitude },
        });
        } else if (t === 'treasure') {
        slots.push({
            slotIndex: slotIndex++,
            x,
            y,
            encounterType: 'treasure',
            difficultyTier: getDifficultyCategory(d.difficulty),
            concealmentNumeric: d.difficulty,
            curseOnFailure: { attribute: d.failCurse.attribute, magnitude: d.failCurse.magnitude },
            rewardIfSuccess: d.rewardItem.type === 'curseClear'
            ? { type: 'curseClear', effect: 'remove one curse chosen by the player' }
            : { type: 'buff', attribute: d.rewardItem.attribute, magnitude: d.rewardItem.magnitude },
        });
        } else if (t === 'npc') {
        slots.push({
            slotIndex: slotIndex++,
            x,
            y,
            encounterType: 'npc',
            difficultyTier: getDifficultyCategory(d.check),
            persuasionCheckNumeric: d.check,
            curseOnFailure: { attribute: d.failCurse.attribute, magnitude: d.failCurse.magnitude },
            rewardIfSuccess: d.rewardItem.type === 'curseClear'
            ? { type: 'curseClear', effect: 'remove one curse chosen by the player' }
            : { type: 'buff', attribute: d.rewardItem.attribute, magnitude: d.rewardItem.magnitude },
        });
        } else if (t === 'item') {
        slots.push({
            slotIndex: slotIndex++,
            x,
            y,
            encounterType: 'item',
            pickup: d.pickup.type === 'curseClear'
            ? { type: 'curseClear', effect: 'remove one curse chosen by the player' }
            : { type: 'buff', attribute: d.pickup.attribute, magnitude: d.pickup.magnitude },
        });
        }
    }
    return { slots };
    }

    function applySlotsToGrid(grid, slots) {
    if (!Array.isArray(slots)) return;
    for (const s of slots) {
        const x = s.x;
        const y = s.y;
        if (x == null || y == null || y < 0 || y >= GRID_HEIGHT || x < 0 || x >= GRID_WIDTH) continue;
        const cell = grid.cells[y][x];
        const d = cell.data;
        if (cell.type === 'enemy') {
        if (s.enemyName) d.name = String(s.enemyName).trim();
        if (s.curseName) d.failCurseName = String(s.curseName).trim();
        } else if (cell.type === 'treasure') {
        if (s.trapName) d.trapName = String(s.trapName).trim();
        if (s.curseName) d.failCurseName = String(s.curseName).trim();
        if (s.rewardItemName && d.rewardItem) d.rewardItem.name = String(s.rewardItemName).trim();
        } else if (cell.type === 'npc') {
        if (s.npcName) d.name = String(s.npcName).trim();
        if (s.curseName) d.failCurseName = String(s.curseName).trim();
        if (s.rewardItemName && d.rewardItem) d.rewardItem.name = String(s.rewardItemName).trim();
        } else if (cell.type === 'item' && d.pickup && s.itemName) {
        d.pickup.name = String(s.itemName).trim();
        }
    }
    }

    function pause(announceFn, resolveFn, canFlee = false, type = 'enemy') {
    announceFn();
    renderStatusPanel();
    G.phase = 'encounter-pause';
    G.pendingResolveFn = resolveFn;
    G.canFlee = canFlee;
    G.encounterType = type;
    renderInputPanel();
    }

    async function continueEncounter() {
    const fn = G.pendingResolveFn;
    G.pendingResolveFn = null;
    G.canFlee = false;

    const cell = G.grid.cells[G.player.pos.y][G.player.pos.x];
    cell.fled = false;

    await fn();
    G.fleeCooldown = false;
    if (!G.phase.startsWith('gameover')) {
        const isGameOver = await checkGameOver();
        if (!isGameOver) renderUI();
    }
    }

    async function fleeEncounter() {
    const cell = G.grid.cells[G.player.pos.y][G.player.pos.x];
    cell.fled = true;
    G.pendingResolveFn = null;
    G.canFlee = false;
    G.phase = 'loading';
    renderInputPanel();

    G.fleeCooldown = true;

    addLog(`<span class="info-txt">The narrator is thinking...</span>`, 'event-neutral');

    const prompt = buildFleeNarrationPrompt(getPlayerContext());
    const narration = await generateNarration(AI_CONTEXT, prompt);

    const logDiv = document.getElementById('log');
    if (logDiv.lastChild) logDiv.removeChild(logDiv.lastChild);

    if (narration) addLog(narration, 'event-neutral');
    addLog(`You flee from the encounter. It remains here should you return.`, 'event-neutral');

    const isGameOver = await checkGameOver();
    if (!isGameOver) {
        G.phase = 'playing';
        renderUI();
    }
    }

    async function startEnemy(data, canFlee) {
    G.phase = 'loading';
    renderInputPanel();
    const eff = getEff();
    const diffCat = getDifficultyCategory(data.power);
    const defaultText = `You enter a chamber and face <span class="highlight">${data.name}</span>. Its Power is <span class="highlight">${diffCat}</span>. Your effective Power is <span class="highlight">${eff.power}</span>. Brace yourself…`;

    addLog(`<span class="info-txt">The narrator is thinking...</span>`, 'event-neutral');

    const prompt = buildEnemyStartPrompt(data, diffCat, getPlayerContext());

    const streamLog = addStreamingLog('event-enemy');
    
    const narration = await generateNarration(AI_CONTEXT, prompt, (chunk) => {
    streamLog.appendText(chunk);
    });
    const logDiv = document.getElementById('log');
    if (logDiv.lastChild) logDiv.removeChild(logDiv.lastChild);

    pause(
    () => {
        if (!narration) {
        streamLog.setText(defaultText);
        }
    },
    () => resolveEnemy(data),
    canFlee,
    'enemy'
        );
    }



    async function resolveEnemy(data) {
    G.phase = 'loading';
    renderInputPanel();
    const eff = getEff();
    const won = eff.power >= data.power;

    let mechText = '';
    let s = null;
    if (won) {
        mechText = `<span class="good-txt">Your strength prevails — ${data.name} falls. Victory!</span><br><span class="good-txt">⬆ You gain a level.</span>`;
    } else {
        s = applyCurseFromEncounter(data);
        damage(1);
        mechText = `<span class="danger-txt">The enemy overwhelms you (Power ${data.power} vs your ${eff.power}). You stagger back, wounded.</span><br><span class="danger-txt">▼ −1 HP · Cursed: <em>${s.name}</em> (${s.attribute} ${s.magnitude})</span>`;
    }

    addLog(`<span class="info-txt">The narrator is thinking...</span>`, 'event-neutral');

    const prompt = buildEnemyResolvePrompt(data, won, getPlayerContext());
    const narration = await generateNarration(AI_CONTEXT, prompt);

    const logDiv = document.getElementById('log');
    if (logDiv.lastChild) logDiv.removeChild(logDiv.lastChild);

    if (narration) addLog(narration, 'event-enemy');
    addLog(mechText, 'event-enemy');
    if (s) await refreshPhysicalDescription(`Inflicted curse ${s.name}.`);

    if (won) levelUp();
    else {
        const isGameOver = await checkGameOver();
        if (!isGameOver) {
        G.phase = 'playing';
        }
    }
    }

    async function startTreasure(data, canFlee) {
    G.phase = 'loading';
    renderInputPanel();
    const eff = getEff();
    const diffCat = getDifficultyCategory(data.difficulty);
    const defaultText = `You spot something in the shadows — a hidden cache, or perhaps a snare. The Difficulty is <span class="highlight">${diffCat}</span>. Your Perception is <span class="highlight">${eff.perception}</span>. Proceed carefully…`;

    addLog(`<span class="info-txt">The narrator is thinking...</span>`, 'event-neutral');
    const item = data.rewardItem
    const prompt = buildTreasureStartPrompt(diffCat, getPlayerContext(), item);
    const narration = await generateNarration(AI_CONTEXT, prompt);

    const logDiv = document.getElementById('log');
    if (logDiv.lastChild) logDiv.removeChild(logDiv.lastChild);

    pause(
        () => addLog(narration ? narration : defaultText, 'event-treasure'),
        () => resolveTreasure(data),
        canFlee,
        'treasure'
    );
    }

    async function resolveTreasure(data) {
    G.phase = 'loading';
    renderInputPanel();
    const eff = getEff();
    const won = eff.perception > data.difficulty;

    let mechText = '';
    let item = null;
    let s = null;
    if (won) {
        item = addItemFixed(data.rewardItem);
        mechText = `<span class="good-txt">Your eye (Perception ${eff.perception}) beats the concealment (Difficulty ${data.difficulty}). Treasure claimed!</span><br><span class="good-txt">⬆ You gain a level and pocket: <em>${item.name}</em> (${itemDescription(item)})</span>`;
    } else {
        s = applyCurseFromEncounter(data);
        damage(1);
        mechText = `<span class="danger-txt">You blunder into <em>${data.trapName}</em> (Difficulty ${data.difficulty} vs Perception ${eff.perception}).</span><br><span class="danger-txt">▼ −1 HP · Cursed: <em>${s.name}</em> (${s.attribute} ${s.magnitude})</span>`;
    }

    addLog(`<span class="info-txt">The narrator is thinking...</span>`, 'event-neutral');
    const item_name = data.rewardItem.name
    const prompt = buildTreasureResolvePrompt(won, getPlayerContext(), item_name, data, s);
    const narration = await generateNarration(AI_CONTEXT, prompt);

    const logDiv = document.getElementById('log');
    if (logDiv.lastChild) logDiv.removeChild(logDiv.lastChild);

    if (narration) addLog(narration, 'event-treasure');
    addLog(mechText, 'event-treasure');
    if (s) await refreshPhysicalDescription(`Inflicted curse ${s.name}.`);

    if (won) levelUp();
    else {
        const isGameOver = await checkGameOver();
        if (!isGameOver) {
        G.phase = 'playing';
        }
    }
    }

    async function startNPC(data, canFlee) {
    G.phase = 'loading';
    renderInputPanel();
    const eff = getEff();
    const diffCat = getDifficultyCategory(data.check);
    const defaultText = `You encounter <span class="highlight">${data.name}</span>. They eye you warily. The Persuasion check is <span class="highlight">${diffCat}</span>. Your Persuasion is <span class="highlight">${eff.persuasion}</span>. Choose your words…`;

    addLog(`<span class="info-txt">The narrator is thinking...</span>`, 'event-neutral');

    const prompt = buildNpcStartPrompt(data, diffCat, getPlayerContext());
    // const narration = await generateNarration(AI_CONTEXT, prompt);
    //narration streaming test
    narrationPanel.textContent = '';

    const narration = await generateNarration(AI_CONTEXT, prompt, (chunk) => {
    narrationPanel.textContent += chunk;
    });
    
    const logDiv = document.getElementById('log');
    if (logDiv.lastChild) logDiv.removeChild(logDiv.lastChild);

    pause(
        () => addLog(narration ? narration : defaultText, 'event-npc'),
        () => resolveNPC(data),
        canFlee,
        'npc'
    );
    }

    async function resolveNPC(data) {
    G.phase = 'loading';
    renderInputPanel();
    const eff = getEff();
    const won = eff.persuasion >= data.check;

    let mechText = '';
    let item = null;
    let s = null;
    if (won) {
        item = addItemFixed(data.rewardItem);
        mechText = `<span class="good-txt">Your words win them over (Persuasion ${eff.persuasion} vs Difficulty ${data.check}). They offer a gift.</span><br><span class="good-txt">Received: <em>${item.name}</em> (${itemDescription(item)})</span>`;
    } else {
        item = data.rewardItem.name;
        s = applyCurseFromEncounter(data);
        mechText = `<span class="danger-txt">Your words fall flat (Persuasion ${eff.persuasion} vs Difficulty ${data.check}). The encounter turns hostile.</span><br><span class="danger-txt">▼ Cursed: <em>${s.name}</em> (${s.attribute} ${s.magnitude})</span>`;
    }

    addLog(`<span class="info-txt">The narrator is thinking...</span>`, 'event-neutral');

    const prompt = buildNpcResolvePrompt(data, won, getPlayerContext(), item, s);
    const narration = await generateNarration(AI_CONTEXT, prompt);

    const logDiv = document.getElementById('log');
    if (logDiv.lastChild) logDiv.removeChild(logDiv.lastChild);

    if (narration) addLog(narration, 'event-npc');
    addLog(mechText, 'event-npc');
    if (s) await refreshPhysicalDescription(`Inflicted curse ${s.name}.`);

    const isGameOver = await checkGameOver();
    if (!isGameOver) {
        G.phase = 'playing';
    }
    }

    async function startItem(data) {
    G.phase = 'loading';
    renderInputPanel();

    const item = addItemFixed(data.pickup);
    const defaultText = `You find an item on the floor: <span class="good-txt">${item.name}</span> (${itemDescription(item)}).`;

    addLog(`<span class="info-txt">The narrator is thinking...</span>`, 'event-neutral');

    const prompt = buildFloorItemPrompt(item, getPlayerContext());
    const narration = await generateNarration(AI_CONTEXT, prompt);

    const logDiv = document.getElementById('log');
    if (logDiv.lastChild) logDiv.removeChild(logDiv.lastChild);

    if (narration) addLog(narration, 'event-neutral');
    addLog(defaultText, 'event-neutral');

    const isGameOver = await checkGameOver();
    if (!isGameOver) {
        G.phase = 'playing';
        renderUI();
    }
    }

    function movePlayer(dir) {
    const { dx, dy } = DIRECTIONS[dir];
    const np = { x: G.player.pos.x + dx, y: G.player.pos.y + dy };

    if (np.x < 0 || np.x >= GRID_WIDTH || np.y < 0 || np.y >= GRID_HEIGHT) {
        addLog(`There is nothing but solid stone in that direction.`, 'event-neutral');
        renderUI();
        return;
    }

    if (G.grid.cells[np.y][np.x].type === 'wall') {
        addLog(`A wall of cold stone blocks your path.`, 'event-neutral');
        renderUI();
        return;
    }

    G.player.pos = np;
    G.turns++;

    const cell = G.grid.cells[np.y][np.x];

    if (cell.type === 'exit') {
        cell.visited = true;
        G.phase = 'gameover-win';
        addLog(`<span class="good-txt">✦ Daylight floods through a hidden door. You have escaped the dungeon!</span>`, 'event-win');
        addLog(`Survived ${G.turns} moves · reached level ${G.player.level}.`, 'event-win');
        renderUI();
        return;
    }

    if (cell.visited && !cell.fled) {
        checkGameOver().then(isGameOver => {
        if (!isGameOver) renderUI();
        });
        return;
    }

    const canFlee = !cell.fled && !G.fleeCooldown;
    cell.visited = true;

    if (cell.type === 'enemy') startEnemy(cell.data, canFlee);
    else if (cell.type === 'treasure') startTreasure(cell.data, canFlee);
    else if (cell.type === 'npc') startNPC(cell.data, canFlee);
    else if (cell.type === 'item') startItem(cell.data);
    else renderUI();
    }

    function getEquippedItemCount() {
    return getEquippedItems().length;
    }

    async function toggleEquipItem(index) {
    const item = G.player.inventory[index];
    if (!item || item.type !== 'buff') return;

    if (!item.equipped && getEquippedItemCount() >= MAX_EQUIPPED_ITEMS) {
        addLog(`<span class="info-txt">You can only equip ${MAX_EQUIPPED_ITEMS} items at a time.</span>`, 'event-neutral');
        renderUI();
        return;
    }

    item.equipped = !item.equipped;
    addLog(`You ${item.equipped ? 'equip' : 'unequip'} <em>${item.name}</em> (${itemDescription(item)}).`, 'event-neutral');
    await refreshPhysicalDescription(`${item.equipped ? 'Equipped' : 'Unequipped'} ${item.name}.`);
    const isGameOver = await checkGameOver();
    if (!isGameOver) renderUI();
    }

    async function useCurseClearItem(index) {
    const item = G.player.inventory[index];
    if (!item || item.type !== 'curseClear') return;

    const curses = G.player.statuses;
    if (!curses.length) {
        addLog(`<span class="info-txt">You have no curses for <em>${item.name}</em> to remove.</span>`, 'event-neutral');
        renderUI();
        return;
    }

    const choices = curses.map((s, i) => `${i + 1}. ${s.name} (${s.attribute} ${s.magnitude})`).join('\n');
    const raw = prompt(`Choose a curse to remove with ${item.name}:\n${choices}`, '1');
    if (raw == null) return;
    const curseIndex = Number(raw) - 1;
    if (!Number.isInteger(curseIndex) || curseIndex < 0 || curseIndex >= curses.length) {
        addLog(`<span class="info-txt">No curse was removed.</span>`, 'event-neutral');
        renderUI();
        return;
    }

    const removed = curses.splice(curseIndex, 1)[0];
    G.player.inventory.splice(index, 1);
    addLog(`<span class="good-txt">You use <em>${item.name}</em> and remove <em>${removed.name}</em>.</span>`, 'event-neutral');
    await refreshPhysicalDescription(`Removed curse ${removed.name} with ${item.name}.`);
    renderUI();
    }

    function applyLevelUp(attr) {
    if (G.player.base[attr] >= MAX_ATTR) return;
    G.player.base[attr] = Math.min(MAX_ATTR, G.player.base[attr] + 1);
    addLog(`<span class="good-txt">You improve your <em>${attr}</em> — base now ${G.player.base[attr]}.</span>`, 'event-level');
    G.phase = 'playing';
    renderUI();
    }

    function addLog(html, cls = 'event-neutral') {
    const div = document.getElementById('log');
    const el = document.createElement('div');
    el.className = `log-entry ${cls}`;
    el.innerHTML = html;
    div.appendChild(el);
    document.getElementById('log-panel').scrollTop = 99999;
    }

    function renderStatusPanel() {
    const p = G.player;
    const eff = getEff();

    const curseHtml = p.statuses.length
        ? p.statuses.map(s => `<span class="status-tag">${s.name}: ${s.attribute} ${s.magnitude}</span>`).join('')
        : '<span class="empty-note">None</span>';

    const equippedItems = p.inventory.filter(item => item.type === 'buff' && item.equipped);
    const activeHtml = equippedItems.length
        ? equippedItems.map(e =>
        `<span class="status-tag" style="border-color:rgba(90,170,208,0.5);background:rgba(58,96,128,0.15);color:#7ecfee;">
            ${e.name}: +${e.magnitude} ${e.attribute}
            </span>`).join('')
        : '<span class="empty-note">None</span>';

    const invHtml = p.inventory.length
        ? p.inventory.map((item, i) => `
            <div class="item-row">
            <span class="item-name">${item.name}</span>
            <span class="item-effect">${itemDescription(item)}</span>
            ${item.type === 'buff'
                ? `<button class="btn-use" onclick="toggleEquipItem(${i})">${item.equipped ? 'Unequip' : 'Equip'}</button>`
                : `<button class="btn-use" onclick="useCurseClearItem(${i})">Use</button>`}
            </div>`).join('')
        : '<span class="empty-note">Empty</span>';

    const attrLine = (label, baseVal, effVal) => {
        const diff = effVal - baseVal;
        const mod = diff === 0 ? ''
        : diff > 0 ? ` <span class="good-txt">(+${diff})</span>`
            : ` <span class="danger-txt">(${diff})</span>`;
        return `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-val">${effVal}${mod}</span></div>`;
    };

    document.getElementById('status-content').innerHTML = `
        <div class="stat-row"><span class="stat-label">Level</span><span class="stat-val">${p.level}</span>
        <span class="stat-label">HP</span>
        <span class="stat-val ${p.hp <= 3 ? 'danger' : ''}">${p.hp} / 10</span></div>
        <div class="hp-bar"><div class="hp-fill" style="width:${(p.hp / 10) * 100}%"></div></div>

        <div class="panel-title section-gap" style="font-size:0.85rem;">Attributes</div>
        ${attrLine('Power', p.base.power, eff.power)}
        ${attrLine('Perception', p.base.perception, eff.perception)}
        ${attrLine('Persuasion', p.base.persuasion, eff.persuasion)}

        <div class="panel-title section-gap" style="font-size:0.85rem;">Equipped Items (${equippedItems.length} / ${MAX_EQUIPPED_ITEMS})</div>
        <div style="padding:4px 0;">${activeHtml}</div>

        <div class="panel-title section-gap" style="font-size:0.85rem;">Curses</div>
        <div style="padding:4px 0;">${curseHtml}</div>

        <div class="panel-title section-gap" style="font-size:0.85rem;">Inventory</div>
        <div>${invHtml}</div>
    `;
    }

    function renderInputPanel() {
    const title = document.getElementById('input-title');
    const buttons = document.getElementById('input-buttons');

    if (G.phase === 'loading') {
        title.textContent = 'Please wait...';
        buttons.innerHTML = '';
        return;
    }

    if (G.phase === 'playing') {
        title.textContent = 'Choose Direction';
        buttons.innerHTML = Object.keys(DIRECTIONS).map(dir =>
        `<button class="btn btn-dir" onclick="movePlayer('${dir}')">${dir}</button>`).join('');
        return;
    }

    if (G.phase === 'encounter-pause') {
        title.textContent = 'An encounter awaits…';
        let resolveText = 'Resolve';
        let fleeText = 'Flee';
        let resolveIcon = '⚔';
        let fleeIcon = '🏃';

        if (G.encounterType === 'enemy') {
        resolveText = 'Engage';
        fleeText = 'Flee';
        } else if (G.encounterType === 'treasure') {
        resolveText = 'Check';
        fleeText = 'Avoid';
        resolveIcon = '🔍';
        } else if (G.encounterType === 'npc') {
        resolveText = 'Persuade';
        fleeText = 'Flee';
        resolveIcon = '🗣';
        }

        buttons.innerHTML = `<button class="btn btn-continue" onclick="continueEncounter()">${resolveIcon} &nbsp;${resolveText}</button>`;
        if (G.canFlee) {
        buttons.innerHTML += `<button class="btn btn-flee" onclick="fleeEncounter()">${fleeIcon} &nbsp;${fleeText}</button>`;
        } else {
        let reason = G.fleeCooldown ? "You must resolve an encounter before fleeing again." : "You cannot flee from this encounter again.";
        buttons.innerHTML += `<button class="btn btn-flee" disabled style="opacity: 0.5; cursor: not-allowed;" title="${reason}">${fleeIcon} &nbsp;${fleeText}</button>`;
        }
        return;
    }

    if (G.phase === 'levelup') {
        title.textContent = '⬆ Level Up — Choose an Attribute to Improve';
        buttons.innerHTML = ['power', 'perception', 'persuasion'].map(attr => {
        const cur = G.player.base[attr];
        const next = Math.min(MAX_ATTR, cur + 1);
        const cap = cur >= MAX_ATTR;
        return `<button class="btn btn-attr" onclick="applyLevelUp('${attr}')" ${cap ? 'disabled' : ''}>
            + ${attr.charAt(0).toUpperCase() + attr.slice(1)} &nbsp;(${cur} → ${next})
        </button>`;
        }).join('');
        return;
    }

    if (G.phase === 'gameover-win') {
        title.textContent = '✦ Victory';
        buttons.innerHTML = `<button class="btn btn-restart" onclick="location.reload()">Play Again</button>`;
        return;
    }

    if (G.phase === 'gameover-loss') {
        title.textContent = '✦ Defeated';
        buttons.innerHTML = `<button class="btn btn-restart" onclick="location.reload()">Try Again</button>`;
        addLog(`Your adventure ends here — level ${G.player.level}, ${G.turns} moves taken.`, 'event-loss');
        return;
    }
    }

    function renderMinimap() {
    const grid = document.getElementById('minimap-grid');
    const W = GRID_WIDTH;
    const H = GRID_HEIGHT;
    grid.style.gridTemplateColumns = `repeat(${W}, 22px)`;
    grid.style.gridTemplateRows = `repeat(${H}, 22px)`;
    let html = '';
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
        const cell = G.grid.cells[y][x];
        const isPlayer = G.player.pos.x === x && G.player.pos.y === y;
        let cls = 'minimap-cell', content = '';
        if (cell.visited) {
            cls += ' visited';
            if (cell.type === 'exit') { cls += ' exit'; content = '✦'; }
            if (cell.fled) { cls += ' fled'; content = '!'; }
        }
        if (isPlayer) { cls += ' player'; content = '◉'; }
        html += `<div class="${cls}">${content}</div>`;
        }
    }
    grid.innerHTML = html;
    }

    function renderUI() {
    renderStatusPanel();
    renderCharacterDescription();
    renderInputPanel();
    renderMinimap();
    }

    async function generateTheme() {
    const { apiKey } = getApiFromDom();
    const inputs = getNamingPromptInputs();
    const statusDiv = document.getElementById('ai-status');

    if (!apiKey || !inputs.theme) {
        statusDiv.innerHTML = '<span class="danger-txt">API Key and Theme are required.</span>';
        return;
    }

    AI_CONTEXT.theme = inputs.theme;
    AI_CONTEXT.characterDesc = inputs.charDesc;

    statusDiv.innerHTML = 'Generating dungeon layout and naming encounters… please wait.';
    document.getElementById('btn-generate').disabled = true;

    try {
        const request = buildCachedNamingRequest(inputs);
        const content = await fetchGridNamingPromptJson(request.prompt);
        const parsed = JSON.parse(content);
        const slots = parsed.slots;
        if (!Array.isArray(slots)) throw new Error('Model response missing "slots" array');

        applySlotsToGrid(request.grid, slots);
        fillDefaultNames(request.grid);
        PENDING_NAMED_GRID = request.grid;
        NAMING_PROMPT_CACHE = null;

        const debugDiv = document.getElementById('debug-names');
        debugDiv.value = JSON.stringify({ version: 2, slots }, null, 2);
        document.getElementById('btn-debug').style.display = 'block';

        statusDiv.innerHTML = '<span class="good-txt">Dungeon mapped and encounters named. Edit JSON if you wish, then proceed.</span>';
        document.getElementById('btn-generate').disabled = false;
        document.getElementById('btn-proceed').textContent = 'Proceed';
    } catch (err) {
        PENDING_NAMED_GRID = null;
        statusDiv.innerHTML = `<span class="danger-txt">Failed to generate: ${err.message}</span>`;
        document.getElementById('btn-generate').disabled = false;
    }
    }

    function skipTheme() {
    if (typeof persistApiLastSession === 'function') persistApiLastSession();
    if (typeof persistThemeLastSession === 'function') persistThemeLastSession();

    const debugDiv = document.getElementById('debug-names');
    const raw = debugDiv.value.trim();
    if (raw) {
        try {
        const parsed = JSON.parse(raw);
        if (parsed.version === 2 && Array.isArray(parsed.slots)) {
            if (!PENDING_NAMED_GRID) {
            alert('No generated map is loaded. Click "Generate map & names" first, or remove "version": 2 from the JSON to use Skip with manual pool overrides.');
            return;
            }
            applySlotsToGrid(PENDING_NAMED_GRID, parsed.slots);
            fillDefaultNames(PENDING_NAMED_GRID);
        } else {
            PENDING_NAMED_GRID = null;
            if (parsed.enemies) ENEMY_NAMES = parsed.enemies;
            if (parsed.npcs) NPC_NAMES = parsed.npcs;
            if (parsed.traps) TRAP_NAMES = parsed.traps;
            if (parsed.items) ITEM_NAMES = parsed.items;
            const curseNames = parsed.curses || parsed.statuses;
            if (curseNames) {
            NEGATIVE_STATUS_POOL = [];
            for (const attr of ['power', 'perception', 'persuasion']) {
                for (const mag of ['-1', '-2']) {
                if (curseNames[attr] && curseNames[attr][mag]) {
                    for (const name of curseNames[attr][mag]) {
                    NEGATIVE_STATUS_POOL.push({ name, attribute: attr, magnitude: parseInt(mag) });
                    }
                }
                }
            }
            }
        }
        } catch (err) {
        alert("Invalid JSON in the generated names window. Please fix it before proceeding.");
        return;
        }
    }

    document.getElementById('ai-setup-screen').style.display = 'none';
    document.getElementById('setup-screen').style.display = 'block';
    }

    function startGame(className) {
    initState(className);
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'grid';
    addLog(`You are standing at the entrance of a ${GRID_WIDTH}×${GRID_HEIGHT} dungeon. The exit lies somewhere within. Survive.`, 'event-neutral');
    renderUI();
    }

    document.addEventListener('keydown', (e) => {
    if (!G || G.phase !== 'playing') return;
    const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const wsad =
        e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W'
        ? 'North'
        : e.key === 'ArrowDown' || e.key === 's' || e.key === 'S'
            ? 'South'
            : e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'
            ? 'East'
            : e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A'
                ? 'West'
                : null;
    if (!wsad) return;
    if (arrows.includes(e.key)) e.preventDefault();
    movePlayer(wsad);
    });
