/**
 * Memo Box for SillyTavern
 */

const MODULE_NAME = "st-memo-box";

const MEMO_DEFAULTS = {
    memoGroups: [],
};

jQuery(async () => {
    console.log("[Memo Box] 확장프로그램 로딩...");

    const { getContext } = SillyTavern;

    // ─── 설정 ───

    function getSettings() {
        const { extensionSettings } = getContext();

        if (!extensionSettings[MODULE_NAME]) {
            extensionSettings[MODULE_NAME] = {};
        }

        const s = extensionSettings[MODULE_NAME];

        for (const [k, v] of Object.entries(MEMO_DEFAULTS)) {
            if (s[k] === undefined) {
                s[k] = JSON.parse(JSON.stringify(v));
            }
        }

        if (!Array.isArray(s.memoGroups)) {
            s.memoGroups = [];
        }

        return s;
    }

    function persist() {
        getContext().saveSettingsDebounced();
    }

    const settings = getSettings();

    // 창 열 때마다 초기화되는 UI 상태
    let collapsedGroups = {};
    let editingItems = {};

    function uid(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function escapeHtml(str = "") {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function getPreviewText(text = "") {
        const cleaned = String(text).replace(/\s+/g, " ").trim();
        return cleaned || "내용";
    }

    async function copyToClipboard(text) {
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (e) {
                console.log(`[${MODULE_NAME}] clipboard API failed:`, e);
            }
        }

        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();

            const ok = document.execCommand("copy");
            document.body.removeChild(ta);

            if (ok) return true;
        } catch (e) {
            console.log(`[${MODULE_NAME}] textarea fallback failed:`, e);
        }

        return false;
    }

    // ─── 메모 팝업 DOM ───

    let memoModalOpen = false;
    let memoBgEl = null;
    let memoPopupEl = null;

    function ensureMemoDOM() {
        if (memoBgEl && memoPopupEl) return;

        memoBgEl = document.createElement("div");
        memoBgEl.id = "memo-bg";
        document.body.appendChild(memoBgEl);

        memoPopupEl = document.createElement("div");
        memoPopupEl.id = "memo-popup";

        memoPopupEl.innerHTML = `
            <div class="memo-header">
                <span class="memo-title">📝 메모</span>
                <span class="memo-close" title="닫기">✕</span>
            </div>

            <div class="memo-body">
                <div id="memo-groups"></div>
            </div>

            <div class="memo-footer">
                <div class="memo-btn memo-btn-add-title" id="memo-add-title">+ 제목 추가</div>
            </div>
        `;

        document.body.appendChild(memoPopupEl);

        memoBgEl.addEventListener("click", closeMemoModal);
        memoBgEl.addEventListener("touchend", (e) => {
            e.preventDefault();
            closeMemoModal();
        });

        memoPopupEl.querySelector(".memo-close").addEventListener("click", closeMemoModal);
        memoPopupEl.querySelector("#memo-add-title").addEventListener("click", addMemoGroup);

        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", () => {
                if (memoModalOpen) memoPosPopup();
            });

            window.visualViewport.addEventListener("scroll", () => {
                if (memoModalOpen) memoPosPopup();
            });
        }
    }

    function memoPosPopup() {
        if (!memoPopupEl) return;

        const vv = window.visualViewport;
        const vH = vv ? vv.height : window.innerHeight;
        const vT = vv ? vv.offsetTop : 0;
        const vW = vv ? vv.width : window.innerWidth;

        memoPopupEl.style.display = "flex";
        memoPopupEl.style.visibility = "hidden";
        memoPopupEl.style.transform = "none";

        const pH = memoPopupEl.offsetHeight;
        const pW = memoPopupEl.offsetWidth;

        memoPopupEl.style.visibility = "visible";

        memoPopupEl.style.top = (vT + Math.max(10, (vH - pH) / 2)) + "px";
        memoPopupEl.style.left = Math.max(5, (vW - pW) / 2) + "px";
    }

    function resetOpenState() {
        collapsedGroups = {};
        editingItems = {};

        for (const group of settings.memoGroups) {
            collapsedGroups[group.id] = true;
        }
    }

    function openMemoModal() {
        if (memoModalOpen) return;

        memoModalOpen = true;

        ensureMemoDOM();
        resetOpenState();
        renderMemoGroups();

        memoBgEl.classList.add("memo-show");
        memoPopupEl.classList.add("memo-show");

        memoPosPopup();
        setTimeout(memoPosPopup, 50);
    }

    function closeMemoModal() {
        if (!memoModalOpen) return;

        memoModalOpen = false;

        if (memoBgEl) {
            memoBgEl.classList.remove("memo-show");
        }

        if (memoPopupEl) {
            memoPopupEl.classList.remove("memo-show");
            memoPopupEl.style.display = "none";
        }
    }

    // ─── 메모 렌더링 ───

    function renderMemoGroups() {
        const wrap = document.getElementById("memo-groups");
        if (!wrap) return;

        wrap.innerHTML = "";

        if (!settings.memoGroups.length) {
            wrap.innerHTML = `<div class="memo-empty">아직 메모가 없습니다</div>`;
            memoPosPopup();
            return;
        }

        settings.memoGroups.forEach((group) => {
            if (!Array.isArray(group.items)) group.items = [];

            const isCollapsed = !!collapsedGroups[group.id];

            const groupEl = document.createElement("div");
            groupEl.className = "memo-group";
            groupEl.dataset.groupId = group.id;

            groupEl.innerHTML = `
                <div class="memo-group-titlebar">
                    <button class="memo-collapse-btn" type="button" title="접기/펼치기">${isCollapsed ? "▶" : "▼"}</button>
                    <input class="text_pole memo-title-input" placeholder="제목" value="${escapeHtml(group.title || "")}">
                </div>

                <div class="memo-group-content" style="${isCollapsed ? "display:none;" : ""}">
                    <div class="memo-group-actions">
                        <div class="memo-small-btn memo-add-item">내용 추가</div>
                        <div class="memo-small-btn memo-delete-title">제목 삭제</div>
                    </div>

                    <div class="memo-items"></div>
                </div>
            `;

            const titlebar = groupEl.querySelector(".memo-group-titlebar");
            const collapseBtn = groupEl.querySelector(".memo-collapse-btn");
            const titleInput = groupEl.querySelector(".memo-title-input");
            const contentEl = groupEl.querySelector(".memo-group-content");

            function toggleGroup() {
                const nextCollapsed = !collapsedGroups[group.id];

                if (nextCollapsed) {
                    collapsedGroups[group.id] = true;
                    collapseBtn.textContent = "▶";
                    contentEl.style.display = "none";
                } else {
                    delete collapsedGroups[group.id];
                    collapseBtn.textContent = "▼";
                    contentEl.style.display = "";
                }

                memoPosPopup();
            }

            collapseBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleGroup();
            });

            titlebar.addEventListener("click", (e) => {
                if (e.target === titleInput) return;
                toggleGroup();
            });

            titleInput.addEventListener("click", (e) => {
                e.stopPropagation();
            });

            titleInput.addEventListener("input", () => {
                group.title = titleInput.value;
                persist();
            });

            groupEl.querySelector(".memo-add-item").addEventListener("click", () => {
                const id = uid("item");

                group.items.push({
                    id,
                    content: "",
                });

                delete collapsedGroups[group.id];
                editingItems[id] = true;

                persist();
                renderMemoGroups();
            });

            groupEl.querySelector(".memo-delete-title").addEventListener("click", () => {
                if (!confirm("이 제목과 안에 있는 내용을 전부 삭제할까요?")) return;

                settings.memoGroups = settings.memoGroups.filter(g => g.id !== group.id);

                delete collapsedGroups[group.id];

                for (const item of group.items) {
                    delete editingItems[item.id];
                }

                persist();
                renderMemoGroups();
            });

            const itemsBox = groupEl.querySelector(".memo-items");

            if (!group.items.length) {
                itemsBox.innerHTML = `<div class="memo-empty-small">이 제목 안에 내용이 없습니다</div>`;
            } else {
                group.items.forEach((item) => {
                    const isEditing = !!editingItems[item.id];

                    const itemEl = document.createElement("div");
                    itemEl.className = "memo-item";
                    itemEl.dataset.itemId = item.id;

                    itemEl.innerHTML = `
                        <div class="memo-item-row">
                            <div class="memo-preview" title="눌러서 수정">${escapeHtml(getPreviewText(item.content))}</div>
                            <div class="memo-row-actions">
                                <div class="memo-mini-btn memo-copy-item" title="복사">📋</div>
                                <div class="memo-mini-btn memo-delete-item" title="삭제">🗑️</div>
                            </div>
                        </div>

                        <div class="memo-editor-wrap" style="${isEditing ? "" : "display:none;"}">
                            <textarea class="text_pole memo-content" rows="4" placeholder="내용">${escapeHtml(item.content || "")}</textarea>
                            <div class="memo-editor-actions">
                                <div class="memo-small-btn memo-close-editor">접기</div>
                            </div>
                        </div>
                    `;

                    const preview = itemEl.querySelector(".memo-preview");
                    const editorWrap = itemEl.querySelector(".memo-editor-wrap");
                    const textarea = itemEl.querySelector(".memo-content");

                    preview.addEventListener("click", () => {
                        editingItems[item.id] = true;
                        editorWrap.style.display = "";
                        memoPosPopup();

                        setTimeout(() => {
                            textarea.focus();
                            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                        }, 0);
                    });

                    textarea.addEventListener("input", () => {
                        item.content = textarea.value;
                        preview.textContent = getPreviewText(item.content);
                        persist();
                    });

                    itemEl.querySelector(".memo-close-editor").addEventListener("click", () => {
                        delete editingItems[item.id];
                        editorWrap.style.display = "none";
                        memoPosPopup();
                    });

                    itemEl.querySelector(".memo-copy-item").addEventListener("click", async (e) => {
                        e.stopPropagation();

                        const ok = await copyToClipboard(item.content || "");

                        if (ok) toastr.success("복사됨");
                        else toastr.error("복사 실패");
                    });

                    itemEl.querySelector(".memo-delete-item").addEventListener("click", (e) => {
                        e.stopPropagation();

                        if (!confirm("이 내용을 삭제할까요?")) return;

                        group.items = group.items.filter(i => i.id !== item.id);
                        delete editingItems[item.id];

                        persist();
                        renderMemoGroups();
                    });

                    itemsBox.appendChild(itemEl);
                });
            }

            wrap.appendChild(groupEl);
        });

        memoPosPopup();
    }

    function addMemoGroup() {
        const title = prompt("제목을 입력하세요", "");

        if (!title || !title.trim()) return;

        const id = uid("group");

        settings.memoGroups.push({
            id,
            title: title.trim(),
            items: [],
        });

        // 새로 만든 제목은 바로 열어둠
        delete collapsedGroups[id];

        persist();
        renderMemoGroups();
    }

    // ─── 확장 메뉴 버튼 ───

    document.getElementById("memo_menu_btn")?.remove();

    const memoMenuBtn = document.createElement("div");
    memoMenuBtn.id = "memo_menu_btn";
    memoMenuBtn.className = "list-group-item flex-container flexGap5 interactable";
    memoMenuBtn.title = "메모";
    memoMenuBtn.innerHTML = '<i class="fa-solid fa-note-sticky"></i> 메모';

    memoMenuBtn.addEventListener("click", () => {
        $("#extensionsMenu").hide();
        openMemoModal();
    });

    const extMenu = document.getElementById("extensionsMenu");

    if (extMenu) {
        extMenu.appendChild(memoMenuBtn);
    } else {
        const obs = new MutationObserver((_, o) => {
            const m = document.getElementById("extensionsMenu");

            if (m) {
                document.getElementById("memo_menu_btn")?.remove();
                m.appendChild(memoMenuBtn);
                o.disconnect();
            }
        });

        obs.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    console.log("[Memo Box] 로드 완료");
});
