/**
 * Memo Box for SillyTavern
 * 제목별 메모 저장 / 수정 / 복사 / 삭제
 * 버튼 위치: #extensionsMenu
 * 창 방식: 중앙 팝업
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

    async function copyToClipboard(text) {
        const value = String(text || "");

        // 1순위: Clipboard API
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(value);
                return true;
            } catch (e) {
                console.log(`[${MODULE_NAME}] clipboard API failed:`, e);
            }
        }

        // 2순위: textarea + execCommand fallback
        try {
            const ta = document.createElement("textarea");
            ta.value = value;

            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            ta.style.top = "-9999px";
            ta.style.opacity = "0";
            ta.style.pointerEvents = "none";

            document.body.appendChild(ta);

            ta.focus();
            ta.select();
            ta.setSelectionRange(0, ta.value.length);

            const ok = document.execCommand("copy");

            document.body.removeChild(ta);

            if (ok) return true;
        } catch (e) {
            console.log(`[${MODULE_NAME}] textarea fallback failed:`, e);
        }

        return false;
    }

    function autoResizeTextarea(textarea) {
        if (!textarea) return;

        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight + 2}px`;
    }

    function autoResizeAllTextareas(root = document) {
        root.querySelectorAll(".memo-content").forEach(textarea => {
            autoResizeTextarea(textarea);
        });
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

        // 팝업을 배경 안에 넣음 → 배경 클릭 = 팝업 바깥 클릭이 자연스럽게 잡힘
        memoBgEl.appendChild(memoPopupEl);

        // 배경 직접 클릭한 경우만 닫기
        memoBgEl.addEventListener("click", (e) => {
            if (e.target === memoBgEl) {
                closeMemoModal();
            }
        });

        memoBgEl.addEventListener("touchend", (e) => {
            if (e.target === memoBgEl) {
                e.preventDefault();
                closeMemoModal();
            }
        });

        memoPopupEl.querySelector(".memo-close").addEventListener("click", closeMemoModal);
        memoPopupEl.querySelector("#memo-add-title").addEventListener("click", addMemoGroup);

        // ESC로 닫기
        document.addEventListener("keydown", (e) => {
            if (!memoModalOpen) return;
            if (e.key === "Escape") {
                e.preventDefault();
                closeMemoModal();
            }
        });
    }

    function resetOpenState() {
        collapsedGroups = {};

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

        setTimeout(() => {
            autoResizeAllTextareas(memoPopupEl);
        }, 50);
    }

    function closeMemoModal() {
        if (!memoModalOpen) return;

        memoModalOpen = false;

        if (memoBgEl) {
            memoBgEl.classList.remove("memo-show");
        }

        if (memoPopupEl) {
            memoPopupEl.classList.remove("memo-show");
        }
    }

    // ─── 메모 렌더링 ───

    function renderMemoGroups() {
        const wrap = document.getElementById("memo-groups");
        if (!wrap) return;

        wrap.innerHTML = "";

        if (!settings.memoGroups.length) {
            wrap.innerHTML = `<div class="memo-empty">아직 메모가 없습니다</div>`;
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
                    setTimeout(() => {
                        autoResizeAllTextareas(groupEl);
                    }, 0);
                }
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

                persist();
                renderMemoGroups();

                setTimeout(() => {
                    const newTextarea = document.querySelector(`.memo-item[data-item-id="${id}"] .memo-content`);
                    if (newTextarea) {
                        newTextarea.focus();
                        autoResizeTextarea(newTextarea);
                    }
                }, 0);
            });

            groupEl.querySelector(".memo-delete-title").addEventListener("click", () => {
                if (!confirm("이 제목과 안에 있는 내용을 전부 삭제할까요?")) return;

                settings.memoGroups = settings.memoGroups.filter(g => g.id !== group.id);

                delete collapsedGroups[group.id];

                persist();
                renderMemoGroups();
            });

            const itemsBox = groupEl.querySelector(".memo-items");

            if (!group.items.length) {
                itemsBox.innerHTML = `<div class="memo-empty-small">이 제목 안에 내용이 없습니다</div>`;
            } else {
                group.items.forEach((item) => {
                    const itemEl = document.createElement("div");
                    itemEl.className = "memo-item";
                    itemEl.dataset.itemId = item.id;

                    itemEl.innerHTML = `
                        <textarea class="text_pole memo-content" rows="1" placeholder="내용">${escapeHtml(item.content || "")}</textarea>

                        <div class="memo-actions">
                            <div class="memo-small-btn memo-copy-item">📋 복사</div>
                            <div class="memo-small-btn memo-delete-item">🗑️ 삭제</div>
                        </div>
                    `;

                    const textarea = itemEl.querySelector(".memo-content");

                    textarea.addEventListener("input", () => {
                        item.content = textarea.value;
                        persist();
                        autoResizeTextarea(textarea);
                    });

                    textarea.addEventListener("focus", () => {
                        autoResizeTextarea(textarea);
                    });

                    itemEl.querySelector(".memo-copy-item").addEventListener("click", async () => {
                        const currentText = textarea ? textarea.value : (item.content || "");
                        const ok = await copyToClipboard(currentText);

                        if (ok) toastr.success("복사됨");
                        else toastr.error("복사 실패");
                    });

                    itemEl.querySelector(".memo-delete-item").addEventListener("click", () => {
                        if (!confirm("이 내용을 삭제할까요?")) return;

                        group.items = group.items.filter(i => i.id !== item.id);

                        persist();
                        renderMemoGroups();
                    });

                    itemsBox.appendChild(itemEl);

                    setTimeout(() => {
                        autoResizeTextarea(textarea);
                    }, 0);
                });
            }

            wrap.appendChild(groupEl);
        });

        setTimeout(() => {
            autoResizeAllTextareas(wrap);
        }, 0);
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

        // 새 제목은 바로 열림
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
