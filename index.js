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
    try {
        ctx.saveSettingsDebounced();
    } catch (e) {
        console.log(`[${EXT_NAME}] save failed`, e);
    }
}

function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureSettings() {
    if (!ctx.extensionSettings[EXT_NAME]) {
        ctx.extensionSettings[EXT_NAME] = JSON.parse(JSON.stringify(DEFAULTS));
    }

    cfg = ctx.extensionSettings[EXT_NAME];

    if (!Array.isArray(cfg.memoGroups)) {
        cfg.memoGroups = [];
    }
}

function toastSuccess(text) {
    if (window.toastr) toastr.success(text);
    else console.log(text);
}

function toastError(text) {
    if (window.toastr) toastr.error(text);
    else console.error(text);
}

async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {}

    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();

        const ok = document.execCommand('copy');
        ta.remove();

        return ok;
    } catch {
        return false;
    }
}

function askTitle() {
    return prompt('제목을 입력하세요', '');
}

function askConfirm(text) {
    return confirm(text);
}

// ─── 부팅 ───

function boot() {
    try {
        console.log(`[${EXT_NAME}] boot`);

        ctx = SillyTavern.getContext();
        ensureSettings();

        attachMenuButton();

        console.log(`[${EXT_NAME}] ready`);
    } catch (e) {
        console.error(`[${EXT_NAME}] boot failed`, e);
    }
}

// ─── 메뉴 버튼 ───

function attachMenuButton() {
    const old = document.getElementById('st_memo_box_btn');
    if (old) old.remove();

    const btn = document.createElement('div');
    btn.id = 'st_memo_box_btn';
    btn.className = 'list-group-item flex-container flexGap5 interactable';
    btn.title = '메모';
    btn.innerHTML = '<i class="fa-solid fa-note-sticky"></i> 메모';

    btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();

        console.log(`[${EXT_NAME}] clicked`);

        const menu = document.getElementById('extensionsMenu');
        if (menu) menu.style.display = 'none';

        toggleMemoBlock();
    };

    const menuNow = document.getElementById('extensionsMenu');

    if (menuNow) {
        menuNow.appendChild(btn);
        return;
    }

    const observer = new MutationObserver(() => {
        const menu = document.getElementById('extensionsMenu');
        if (!menu) return;

        if (!document.getElementById('st_memo_box_btn')) {
            menu.appendChild(btn);
        }

        observer.disconnect();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

// ─── 메모창 ───

function toggleMemoBlock() {
    const existing = document.getElementById('st-memo-box-block');

    if (existing) {
        existing.remove();
        return;
    }

    showMemoBlock();
}

function removeMemoBlock() {
    const existing = document.getElementById('st-memo-box-block');
    if (existing) existing.remove();
}

function showMemoBlock() {
    try {
        console.log(`[${EXT_NAME}] showMemoBlock`);

        ensureSettings();
        removeMemoBlock();

        const block = document.createElement('div');
        block.id = 'st-memo-box-block';
        block.className = 'stmb-block';

        block.innerHTML = `
            <div class="stmb-block-head">
                <span class="stmb-block-title">📝 메모</span>
                <div class="stmb-block-btns">
                    <button class="stmb-block-btn" id="stmb-add-title" type="button" title="제목 추가">＋</button>
                    <button class="stmb-block-btn" id="stmb-close" type="button" title="닫기">✕</button>
                </div>
            </div>
            <div class="stmb-body" id="stmb-body"></div>
        `;

        document.body.appendChild(block);

        document.getElementById('stmb-close').onclick = removeMemoBlock;
        document.getElementById('stmb-add-title').onclick = addMemoGroup;

        renderMemoBody();

        console.log(`[${EXT_NAME}] block appended`);
    } catch (e) {
        console.error(`[${EXT_NAME}] showMemoBlock failed`, e);
        alert(`메모창 생성 실패: ${e.message}`);
    }
}

function renderMemoBody() {
    const body = document.getElementById('stmb-body');
    if (!body) return;

    body.innerHTML = '';

    if (!cfg.memoGroups.length) {
        const empty = document.createElement('div');
        empty.className = 'stmb-empty';
        empty.textContent = '아직 메모가 없습니다';
        body.appendChild(empty);
        return;
    }

    cfg.memoGroups.forEach(group => {
        if (!Array.isArray(group.items)) group.items = [];

        const groupEl = document.createElement('div');
        groupEl.className = 'stmb-group';
        groupEl.dataset.groupId = group.id;

        const head = document.createElement('div');
        head.className = 'stmb-group-head';

        const titleInput = document.createElement('input');
        titleInput.className = 'text_pole stmb-title-input';
        titleInput.placeholder = '제목';
        titleInput.value = group.title || '';
        titleInput.oninput = function () {
            group.title = titleInput.value;
            persist();
        };

        const addItemBtn = document.createElement('button');
        addItemBtn.className = 'stmb-act';
        addItemBtn.type = 'button';
        addItemBtn.textContent = '내용 추가';
        addItemBtn.onclick = function () {
            group.items.push({
                id: uid('item'),
                content: '',
            });

            persist();
            renderMemoBody();
        };

        const deleteGroupBtn = document.createElement('button');
        deleteGroupBtn.className = 'stmb-act';
        deleteGroupBtn.type = 'button';
        deleteGroupBtn.textContent = '제목 삭제';
        deleteGroupBtn.onclick = function () {
            if (!askConfirm('이 제목과 안에 있는 내용을 전부 삭제할까요?')) return;

            cfg.memoGroups = cfg.memoGroups.filter(g => g.id !== group.id);

            persist();
            renderMemoBody();
        };

        head.appendChild(titleInput);
        head.appendChild(addItemBtn);
        head.appendChild(deleteGroupBtn);

        const itemsBox = document.createElement('div');
        itemsBox.className = 'stmb-items';

        if (!group.items.length) {
            const empty = document.createElement('div');
            empty.className = 'stmb-empty-small';
            empty.textContent = '이 제목 안에 내용이 없습니다';
            itemsBox.appendChild(empty);
        } else {
            group.items.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.className = 'stmb-item';
                itemEl.dataset.itemId = item.id;

                const textarea = document.createElement('textarea');
                textarea.className = 'text_pole stmb-content';
                textarea.rows = 4;
                textarea.placeholder = '내용';
                textarea.value = item.content || '';
                textarea.oninput = function () {
                    item.content = textarea.value;
                    persist();
                };

                const actions = document.createElement('div');
                actions.className = 'stmb-actions';

                const copyBtn = document.createElement('button');
                copyBtn.className = 'stmb-act';
                copyBtn.type = 'button';
                copyBtn.textContent = '📋 복사';
                copyBtn.onclick = async function () {
                    const ok = await copyToClipboard(item.content || '');
                    if (ok) toastSuccess('복사됨');
                    else toastError('복사 실패');
                };

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'stmb-act';
                deleteBtn.type = 'button';
                deleteBtn.textContent = '🗑️ 삭제';
                deleteBtn.onclick = function () {
                    if (!askConfirm('이 내용을 삭제할까요?')) return;

                    group.items = group.items.filter(i => i.id !== item.id);

                    persist();
                    renderMemoBody();
                };

                actions.appendChild(copyBtn);
                actions.appendChild(deleteBtn);

                itemEl.appendChild(textarea);
                itemEl.appendChild(actions);

                itemsBox.appendChild(itemEl);
            });
        }

        groupEl.appendChild(head);
        groupEl.appendChild(itemsBox);

        body.appendChild(groupEl);
    });
}

function addMemoGroup() {
    const title = askTitle();

    if (!title || !title.trim()) return;

    cfg.memoGroups.push({
        id: uid('group'),
        title: title.trim(),
        items: [],
    });

    persist();
    renderMemoBody();
}

// ─── 시작 ───

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
