/**
 * Memo Box for SillyTavern
 * 제목별 메모 저장 / 수정 / 복사 / 삭제
 */

const MODULE_NAME = "st-memo-box";

const MEMO_DEFAULTS = {
    memoGroups: [],
};

jQuery(async () => {
    console.log("[Memo Box] 확장프로그램 로딩...");

    const { getContext } = SillyTavern;

    function getSettings() {
        const { extensionSettings } = getContext();
        if (!extensionSettings[MODULE_NAME]) {
            extensionSettings[MODULE_NAME] = {};
        }
        const s = extensionSettings[MODULE_NAME];
        for (const [k, v] of Object.entries(MEMO_DEFAULTS)) {
            if (s[k] === undefined) s[k] = JSON.parse(JSON.stringify(v));
        }
        if (!Array.isArray(s.memoGroups)) s.memoGroups = [];

        // 마이그레이션: item.title 필드 추가
        for (const group of s.memoGroups) {
            if (Array.isArray(group.items)) {
                for (const item of group.items) {
                    if (item.title === undefined) item.title = "";
                }
            }
        }

        return s;
    }

    function persist() { getContext().saveSettingsDebounced(); }

    const settings = getSettings();

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
        if (navigator.clipboard?.writeText) {
            try { await navigator.clipboard.writeText(value); return true; }
            catch (e) { console.log(`[${MODULE_NAME}] clipboard API failed:`, e); }
        }
        try {
            const ta = document.createElement("textarea");
            ta.value = value;
            ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            if (ok) return true;
        } catch (e) { console.log(`[${MODULE_NAME}] textarea fallback failed:`, e); }
        return false;
    }

    function autoResizeTextarea(textarea) {
        if (!textarea) return;
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight + 2}px`;
        memoPosPopup();
    }

    function autoResizeAllTextareas(root = document) {
        root.querySelectorAll(".memo-content").forEach(textarea => {
            autoResizeTextarea(textarea);
        });
    }

    // ─── 메모 팝업 DOM (한 번만 생성) ───

    let memoModalOpen = false;
    let memoJustOpened = false;
    let memoBgEl = null;
    let memoPopupEl = null;

    const memoPopupHtml = `
    <div id="memo-bg"></div>
    <div id="memo-popup">
        <div class="memo-header">
            <span class="memo-title">📝 메모</span>
            <span class="memo-close" title="닫기">✕</span>
        </div>
        <div class="memo-body">
            <div id="memo-groups"></div>
        </div>
        <div class="memo-footer">
            <div class="memo-btn memo-btn-add-title" id="memo-add-title">+ 그룹 추가</div>
        </div>
    </div>`;

    $("body").append(memoPopupHtml);

    memoBgEl = document.getElementById("memo-bg");
    memoPopupEl = document.getElementById("memo-popup");

    // 배경 클릭 → 닫기 (모바일 ST 환경에서 #memo-bg 직접 클릭이 안 잡혀서 document로 위임)
    document.addEventListener("click", (e) => {
        if (!memoModalOpen) return;
        // 팝업 뜬 직후의 클릭(메뉴 버튼 클릭 잔여)은 무시
        if (memoJustOpened) return;
        // 팝업 내부 클릭이면 무시
        if (memoPopupEl && memoPopupEl.contains(e.target)) return;
        closeMemoModal();
    });

    const closeBtn = memoPopupEl.querySelector(".memo-close");
    const closeBtnHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeMemoModal();
    };
    closeBtn.addEventListener("click", closeBtnHandler);
    closeBtn.addEventListener("touchend", closeBtnHandler);

    memoPopupEl.querySelector("#memo-add-title").addEventListener("click", addMemoGroup);

    // ESC
    document.addEventListener("keydown", (e) => {
        if (!memoModalOpen) return;
        if (e.key === "Escape") { e.preventDefault(); closeMemoModal(); }
    });

    // viewport
    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", () => { if (memoModalOpen) memoPosPopup(); });
        window.visualViewport.addEventListener("scroll", () => { if (memoModalOpen) memoPosPopup(); });
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
        for (const group of settings.memoGroups) {
            collapsedGroups[group.id] = true;
        }
    }

    function openMemoModal() {
        if (memoModalOpen) return;
        memoModalOpen = true;
        memoJustOpened = true;

        resetOpenState();
        renderMemoGroups();

        memoBgEl.classList.add("memo-show");
        memoPopupEl.classList.add("memo-show");

        memoPosPopup();
        setTimeout(memoPosPopup, 50);
        setTimeout(() => {
            autoResizeAllTextareas(memoPopupEl);
            memoPosPopup();
        }, 100);

        // 메뉴 버튼 클릭이 document로 버블링되어 바로 닫히는 것 방지
        setTimeout(() => { memoJustOpened = false; }, 300);
    }

    function closeMemoModal() {
        if (!memoModalOpen) return;
        memoModalOpen = false;

        memoBgEl.classList.remove("memo-show");
        memoPopupEl.classList.remove("memo-show");
        memoPopupEl.style.display = "none";
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
                        <div class="memo-small-btn memo-delete-title">그룹 삭제</div>
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
                        memoPosPopup();
                    }, 0);
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

            titleInput.addEventListener("click", (e) => e.stopPropagation());

            titleInput.addEventListener("input", () => {
                group.title = titleInput.value;
                persist();
            });

            groupEl.querySelector(".memo-add-item").addEventListener("click", () => {
                const id = uid("item");
                group.items.push({ id, title: "", content: "" });
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
                if (!confirm("이 그룹과 안에 있는 내용을 전부 삭제할까요?")) return;
                settings.memoGroups = settings.memoGroups.filter(g => g.id !== group.id);
                delete collapsedGroups[group.id];
                persist();
                renderMemoGroups();
            });

            const itemsBox = groupEl.querySelector(".memo-items");

            if (!group.items.length) {
                itemsBox.innerHTML = `<div class="memo-empty-small">이 그룹 안에 내용이 없습니다</div>`;
            } else {
                group.items.forEach((item) => {
                    const itemEl = document.createElement("div");
                    itemEl.className = "memo-item";
                    itemEl.dataset.itemId = item.id;

                    const hasTitle = !!(item.title && item.title.length > 0);

                    itemEl.innerHTML = `
                        <div class="memo-item-title-row" style="${hasTitle ? "" : "display:none;"}">
                            <input class="text_pole memo-item-title-input" placeholder="내용 제목" value="${escapeHtml(item.title || "")}">
                        </div>

                        <div class="memo-add-item-title-row" style="${hasTitle ? "display:none;" : ""}">
                            <span class="memo-add-item-title-link">+ 제목 추가</span>
                        </div>

                        <textarea class="text_pole memo-content" rows="1" placeholder="내용">${escapeHtml(item.content || "")}</textarea>

                        <div class="memo-actions">
                            <div class="memo-small-btn memo-copy-item">📋 복사</div>
                            <div class="memo-small-btn memo-delete-item">🗑️ 삭제</div>
                        </div>
                    `;

                    const titleRow = itemEl.querySelector(".memo-item-title-row");
                    const titleInputEl = itemEl.querySelector(".memo-item-title-input");
                    const addTitleRow = itemEl.querySelector(".memo-add-item-title-row");
                    const addTitleLink = itemEl.querySelector(".memo-add-item-title-link");
                    const textarea = itemEl.querySelector(".memo-content");

                    addTitleLink.addEventListener("click", () => {
                        addTitleRow.style.display = "none";
                        titleRow.style.display = "";
                        titleInputEl.focus();
                        memoPosPopup();
                    });

                    titleInputEl.addEventListener("input", () => {
                        item.title = titleInputEl.value;
                        persist();
                    });

                    titleInputEl.addEventListener("blur", () => {
                        if (!titleInputEl.value.trim()) {
                            item.title = "";
                            persist();
                            titleRow.style.display = "none";
                            addTitleRow.style.display = "";
                            memoPosPopup();
                        }
                    });

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

                    setTimeout(() => autoResizeTextarea(textarea), 0);
                });
            }

            wrap.appendChild(groupEl);
        });

        setTimeout(() => {
            autoResizeAllTextareas(wrap);
            memoPosPopup();
        }, 0);
    }

    function addMemoGroup() {
        const title = prompt("그룹 이름을 입력하세요", "");
        if (!title || !title.trim()) return;

        const id = uid("group");
        settings.memoGroups.push({
            id,
            title: title.trim(),
            items: [],
        });
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
        obs.observe(document.body, { childList: true, subtree: true });
    }

    console.log("[Memo Box] 로드 완료");
});
