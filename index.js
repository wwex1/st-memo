/**
 * Memo Box for SillyTavern
 * 제목별 메모 저장 / 수정 / 복사 / 삭제
 * 버튼 위치: #extensionsMenu
 * 메모창 위치: 플로팅
 */

const EXT_NAME = 'st-MemoBox';

const DEFAULTS = {
    memoGroups: [],
};

let ctx = null;
let cfg = {};

function persist() {
    ctx.saveSettingsDebounced();
}

function esc(str = '') {
    const d = document.createElement('span');
    d.textContent = String(str);
    return d.innerHTML;
}

function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureSettings() {
    if (!ctx.extensionSettings[EXT_NAME]) {
        ctx.extensionSettings[EXT_NAME] = structuredClone(DEFAULTS);
    }

    cfg = ctx.extensionSettings[EXT_NAME];

    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (cfg[key] === undefined) cfg[key] = structuredClone(value);
    }

    if (!Array.isArray(cfg.memoGroups)) {
        cfg.memoGroups = [];
    }
}

async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            console.log(`[${EXT_NAME}] clipboard API failed:`, e);
        }
    }

    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();

        const ok = document.execCommand('copy');
        document.body.removeChild(ta);

        return ok;
    } catch (e) {
        console.log(`[${EXT_NAME}] textarea copy fallback failed:`, e);
        return false;
    }
}

// ─── 부팅 ───

async function boot() {
    console.log(`[${EXT_NAME}] Booting...`);

    ctx = SillyTavern.getContext();
    ensureSettings();
    bindMenuButton();

    console.log(`[${EXT_NAME}] Ready.`);
}

// ─── 확장 메뉴 버튼 ───

function bindMenuButton() {
    if (document.getElementById('st_memo_box_btn')) return;

    const memoBtn = document.createElement('div');
    memoBtn.id = 'st_memo_box_btn';
    memoBtn.className = 'list-group-item flex-container flexGap5 interactable';
    memoBtn.title = '메모';
    memoBtn.innerHTML = '<i class="fa-solid fa-note-sticky"></i> 메모';

    memoBtn.addEventListener('click', () => {
        $('#extensionsMenu').hide();

        if (document.getElementById('st-memo-box-block')) {
            removeMemoBlock();
        } else {
            showMemoBlock();
        }
    });

    const extMenu = document.getElementById('extensionsMenu');

    if (extMenu) {
        extMenu.appendChild(memoBtn);
        return;
    }

    const obs = new MutationObserver((_, observer) => {
        const menu = document.getElementById('extensionsMenu');

        if (menu && !document.getElementById('st_memo_box_btn')) {
            menu.appendChild(memoBtn);
            observer.disconnect();
        }
    });

    obs.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

// ─── 메모 블록 ───

function removeMemoBlock() {
    $('#st-memo-box-block').remove();
}

function showMemoBlock() {
    ensureSettings();
    removeMemoBlock();

    const block = $('<div id="st-memo-box-block" class="stmb-block"></div>');

    const head = $('<div class="stmb-block-head"></div>');
    head.append('<span class="stmb-block-title">📝 메모</span>');

    const btns = $('<div class="stmb-block-btns"></div>');
    btns.append('<button class="stmb-block-btn stmb-add-title" title="제목 추가">＋</button>');
    btns.append('<button class="stmb-block-btn stmb-close" title="닫기">✕</button>');

    head.append(btns);
    block.append(head);

    const body = $('<div class="stmb-body"></div>');

    if (!cfg.memoGroups.length) {
        body.append('<div class="stmb-empty">아직 메모가 없습니다</div>');
    } else {
        cfg.memoGroups.forEach(group => {
            body.append(renderMemoGroup(group));
        });
    }

    block.append(body);

    $('body').append(block);

    bindMemoEvents(block);
}

function renderMemoGroup(group) {
    if (!Array.isArray(group.items)) group.items = [];

    const groupEl = $(`
        <div class="stmb-group" data-group-id="${esc(group.id)}">
            <div class="stmb-group-head">
                <input class="text_pole stmb-title-input" value="${esc(group.title || '')}" placeholder="제목">
                <button class="stmb-act stmb-add-item">내용 추가</button>
                <button class="stmb-act stmb-delete-title">제목 삭제</button>
            </div>

            <div class="stmb-items"></div>
        </div>
    `);

    const itemsBox = groupEl.find('.stmb-items');

    if (!group.items.length) {
        itemsBox.append('<div class="stmb-empty-small">이 제목 안에 내용이 없습니다</div>');
    } else {
        group.items.forEach(item => {
            itemsBox.append(renderMemoItem(item));
        });
    }

    return groupEl;
}

function renderMemoItem(item) {
    return $(`
        <div class="stmb-item" data-item-id="${esc(item.id)}">
            <textarea class="text_pole stmb-content" rows="4" placeholder="내용">${esc(item.content || '')}</textarea>

            <div class="stmb-actions">
                <button class="stmb-act stmb-copy-item">📋 복사</button>
                <button class="stmb-act stmb-delete-item">🗑️ 삭제</button>
            </div>
        </div>
    `);
}

// ─── 메모 이벤트 ───

function bindMemoEvents(block) {
    block.find('.stmb-close').on('click', removeMemoBlock);

    block.find('.stmb-add-title').on('click', async () => {
        const title = await ctx.Popup.show.input('제목을 입력하세요', '메모 제목 추가');

        if (!title?.trim()) return;

        cfg.memoGroups.push({
            id: uid('group'),
            title: title.trim(),
            items: [],
        });

        persist();
        showMemoBlock();
    });

    block.find('.stmb-title-input').on('input', function () {
        const groupId = $(this).closest('.stmb-group').data('group-id');
        const group = cfg.memoGroups.find(g => g.id === groupId);

        if (!group) return;

        group.title = $(this).val();
        persist();
    });

    block.find('.stmb-add-item').on('click', function () {
        const groupId = $(this).closest('.stmb-group').data('group-id');
        const group = cfg.memoGroups.find(g => g.id === groupId);

        if (!group) return;
        if (!Array.isArray(group.items)) group.items = [];

        group.items.push({
            id: uid('item'),
            content: '',
        });

        persist();
        showMemoBlock();
    });

    block.find('.stmb-delete-title').on('click', async function () {
        const groupId = $(this).closest('.stmb-group').data('group-id');

        const ok = await ctx.Popup.show.confirm(
            '이 제목과 안에 있는 내용을 전부 삭제할까요?',
            '제목 삭제'
        );

        if (!ok) return;

        cfg.memoGroups = cfg.memoGroups.filter(g => g.id !== groupId);

        persist();
        showMemoBlock();
    });

    block.find('.stmb-content').on('input', function () {
        const groupId = $(this).closest('.stmb-group').data('group-id');
        const itemId = $(this).closest('.stmb-item').data('item-id');

        const group = cfg.memoGroups.find(g => g.id === groupId);
        const item = group?.items?.find(i => i.id === itemId);

        if (!item) return;

        item.content = $(this).val();
        persist();
    });

    block.find('.stmb-copy-item').on('click', async function () {
        const groupId = $(this).closest('.stmb-group').data('group-id');
        const itemId = $(this).closest('.stmb-item').data('item-id');

        const group = cfg.memoGroups.find(g => g.id === groupId);
        const item = group?.items?.find(i => i.id === itemId);

        if (!item) return;

        const ok = await copyToClipboard(item.content || '');

        if (ok) toastr.success('복사됨');
        else toastr.error('복사 실패');
    });

    block.find('.stmb-delete-item').on('click', async function () {
        const groupId = $(this).closest('.stmb-group').data('group-id');
        const itemId = $(this).closest('.stmb-item').data('item-id');

        const group = cfg.memoGroups.find(g => g.id === groupId);

        if (!group) return;

        const ok = await ctx.Popup.show.confirm(
            '이 내용을 삭제할까요?',
            '내용 삭제'
        );

        if (!ok) return;

        group.items = group.items.filter(i => i.id !== itemId);

        persist();
        showMemoBlock();
    });
}

jQuery(async () => {
    await boot();
});
