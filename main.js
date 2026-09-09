const { Plugin, ItemView, Modal, Notice, Setting, PluginSettingTab, TFile } = require("obsidian");

const VIEW_TYPE_GACHA = "gacha-tracker-view";
const DEFAULT_DATA = { version: 6, characters: [], pools: [] };

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function imagePath(name) {
  return `Gacha Tracker/images/${name}`;
}
async function ensureFolder(app, path) {
  const parts = path.split("/");
  let cur = "";
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(cur)) {
      try { await app.vault.createFolder(cur); } catch (_) {}
    }
  }
}
async function importImage(app, file) {
  if (!file) return null;
  await ensureFolder(app, "Gacha Tracker/images");
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = imagePath(`${uid("img")}.${ext}`);
  const data = await file.arrayBuffer();
  await app.vault.createBinary(path, data);
  return path;
}
function imageSrc(app, path) {
  if (!path) return "";
  const f = app.vault.getAbstractFileByPath(path);
  return f instanceof TFile ? app.vault.getResourcePath(f) : "";
}

class ConfirmModal extends Modal {
  constructor(app, message, onConfirm) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl("h3", { text: "确认操作" });
    this.contentEl.createEl("p", { text: this.message });
    const row = this.contentEl.createDiv({ cls: "modal-button-container" });
    new Setting(row)
      .addButton(b => b.setButtonText("取消").onClick(() => this.close()))
      .addButton(b => b.setButtonText("确认").setCta().onClick(async () => {
        await this.onConfirm();
        this.close();
      }));
  }
}


class CharacterModal extends Modal {
  constructor(app, character, onSave) {
    super(app);
    this.character = character;
    this.onSave = onSave;
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.character ? "编辑密探" : "新增密探" });

    let name = this.character?.name || "";
    let image = this.character?.image || "";
    let element = this.character?.element || "混沌";
    let profession = this.character?.profession || "破军";
    let keywordLeft = this.character?.keywordLeft || "";
    let keywordRight = this.character?.keywordRight || "";

    new Setting(this.contentEl)
      .setName("密探名称")
      .addText(t => t.setValue(name).onChange(v => name = v));

    const imageSetting = new Setting(this.contentEl)
      .setName("密探图片")
      .setDesc("图片保存到 Vault/Gacha Tracker/images/，缩略图会完整等比显示。");

    imageSetting.addButton(b => b.setButtonText(image ? "更换图片" : "导入图片").onClick(async () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const path = await importImage(this.app, input.files?.[0]);
        if (path) {
          image = path;
          new Notice("密探图片已保存");
        }
      };
      input.click();
    }));

    if (image) {
      imageSetting.addButton(b => b.setButtonText("移除图片").onClick(() => {
        image = "";
        new Notice("已移除密探图片引用");
      }));
    }

    new Setting(this.contentEl)
      .setName("属性")
      .addDropdown(d => {
        ["混沌","地","水","风","火","阳","阴"].forEach(v => d.addOption(v, v));
        d.setValue(element).onChange(v => element = v);
      });

    new Setting(this.contentEl)
      .setName("职业")
      .addDropdown(d => {
        ["破军","龙盾","岐黄","神纪","诡道"].forEach(v => d.addOption(v, v));
        d.setValue(profession).onChange(v => profession = v);
      });

    new Setting(this.contentEl)
      .setName("左下关键词")
      .setDesc("例如：过敏、记录、将星耀")
      .addText(t => t.setValue(keywordLeft).setPlaceholder("可留空").onChange(v => keywordLeft = v));

    new Setting(this.contentEl)
      .setName("右下关键词")
      .setDesc("例如：猫猫切换、龙盾强化")
      .addText(t => t.setValue(keywordRight).setPlaceholder("可留空").onChange(v => keywordRight = v));

    const row = this.contentEl.createDiv({ cls: "modal-button-container" });
    new Setting(row)
      .addButton(b => b.setButtonText("取消").onClick(() => this.close()))
      .addButton(b => b.setButtonText("保存").setCta().onClick(async () => {
        if (!name.trim()) return new Notice("请输入密探名称");
        await this.onSave({
          ...(this.character || {}),
          id: this.character?.id || uid("char"),
          name: name.trim(),
          image,
          element,
          profession,
          keywordLeft: keywordLeft.trim(),
          keywordRight: keywordRight.trim()
        });
        this.close();
      }));
  }
}

class CharacterLibraryModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    this.render();
  }
  render() {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "密探图鉴" });

    new Setting(this.contentEl)
      .setName("新增密探")
      .addButton(b => b.setButtonText("新增").setCta().onClick(() => {
        new CharacterModal(this.app, null, async c => {
          this.plugin.data.characters.push(c);
          await this.plugin.saveGachaData();
          this.render();
          this.plugin.view?.render();
        }).open();
      }));

    const grid = this.contentEl.createDiv({ cls: "library-grid" });

    for (const c of this.plugin.data.characters) {
      const card = grid.createDiv({ cls: "library-card" });
      const src = imageSrc(this.app, c.image);

      if (src) {
        const img = card.createEl("img", { cls: "library-avatar" });
        img.src = src;
      } else {
        card.createDiv({ cls: "library-avatar library-avatar-placeholder", text: "无图" });
      }

      card.createDiv({ cls: "character-name", text: c.name });

      const actions = card.createDiv({ cls: "library-card-actions" });
      new Setting(actions)
        .addButton(b => b.setButtonText("编辑").onClick((ev) => {
          ev.stopPropagation();
          new CharacterModal(this.app, c, async nc => {
            Object.assign(c, nc);
            delete c.note;
            await this.plugin.saveGachaData();
            this.render();
            this.plugin.view?.render();
          }).open();
        }))
        .addButton(b => b.setButtonText("删除").onClick((ev) => {
          ev.stopPropagation();
          new ConfirmModal(this.app, `确定删除「${c.name}」？`, async () => {
            this.plugin.data.characters = this.plugin.data.characters.filter(x => x.id !== c.id);
            for (const p of this.plugin.data.pools) {
              p.upCharacterIds = (p.upCharacterIds || []).filter(id => id !== c.id);
            }
            await this.plugin.saveGachaData();
            this.render();
            this.plugin.view?.render();
          }).open();
        }));

      card.onclick = () => {
        card.toggleClass("show-actions", !card.hasClass("show-actions"));
      };
    }
  }
}

class CharacterPickerModal extends Modal {
  constructor(app, plugin, selected, onSave) {
    super(app);
    this.plugin = plugin;
    this.selected = [...selected];
    this.onSave = onSave;
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "选择UP密探" });
    this.contentEl.createEl("p", {
      cls: "pool-details-hint",
      text: "数量不限。抽到这些密探算不歪，抽到密探图鉴中的其他密探自动算歪。"
    });

    const grid = this.contentEl.createDiv({ cls: "character-picker-grid" });

    for (const c of this.plugin.data.characters) {
      const card = grid.createDiv({ cls: "character-picker-card" });
      if (this.selected.includes(c.id)) card.addClass("is-selected");

      const src = imageSrc(this.app, c.image);
      if (src) {
        const img = card.createEl("img", { cls: "picker-avatar" });
        img.src = src;
      } else {
        card.createDiv({ cls: "picker-avatar picker-avatar-placeholder", text: "无图" });
      }

      card.createDiv({ cls: "character-picker-name", text: c.name });

      card.onclick = () => {
        const i = this.selected.indexOf(c.id);
        if (i >= 0) this.selected.splice(i, 1);
        else this.selected.push(c.id);
        card.toggleClass("is-selected", this.selected.includes(c.id));
      };
    }

    const row = this.contentEl.createDiv({ cls: "modal-button-container" });
    new Setting(row)
      .addButton(b => b.setButtonText("取消").onClick(() => this.close()))
      .addButton(b => b.setButtonText("确定").setCta().onClick(() => {
        this.onSave(this.selected);
        this.close();
      }));
  }
}

class RecordModal extends Modal {
  constructor(app, plugin, pool, record, onSave) {
    super(app);
    this.plugin = plugin;
    this.pool = pool;
    this.record = record;
    this.onSave = onSave;
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.record ? "编辑抽卡记录" : "添加抽卡记录" });

    let pulls = this.record?.pulls ?? 1;
    let characterId = this.record?.characterId || this.plugin.data.characters?.[0]?.id || "";

    new Setting(this.contentEl)
      .setName("本次多少抽")
      .addText(t => t
        .setValue(String(pulls))
        .setPlaceholder("1")
        .onChange(v => pulls = Math.max(1, parseInt(v) || 1)));

    new Setting(this.contentEl)
      .setName("角色")
      .setDesc("密探来源为整个密探图鉴。")
      .addDropdown(d => {
        for (const c of this.plugin.data.characters) d.addOption(c.id, c.name);
        d.setValue(characterId).onChange(v => characterId = v);
      });

    const row = this.contentEl.createDiv({ cls: "modal-button-container" });
    new Setting(row)
      .addButton(b => b.setButtonText("取消").onClick(() => this.close()))
      .addButton(b => b.setButtonText("保存").setCta().onClick(async () => {
        if (!characterId) return new Notice("请先在密探图鉴添加并选择密探");
        const r = {
          ...(this.record || {}),
          id: this.record?.id || uid("pull"),
          pulls,
          characterId,
          createdAt: this.record?.createdAt || Date.now()
        };
        delete r.note;
        r.isOffRate = this.plugin.isOffRate(this.pool, characterId);
        await this.onSave(r);
        this.close();
      }));
  }
}

class PoolModal extends Modal {
  constructor(app, plugin, pool, onSave) {
    super(app);
    this.plugin = plugin;
    this.pool = pool;
    this.onSave = onSave;
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.pool ? "编辑卡池" : "新建卡池" });

    let name = this.pool?.name || "";
    let type = this.pool?.type || "up";
    let upCharacterIds = [...(this.pool?.upCharacterIds || [])];
    let cover = this.pool?.cover || "";
    const maxOrder = Math.max(0, ...this.plugin.data.pools.map(p => Number(p.sortOrder) || 0));
    let sortOrder = this.pool?.sortOrder ?? (maxOrder + 1);

    new Setting(this.contentEl)
      .setName("卡池名称")
      .addText(t => t.setValue(name).onChange(v => name = v));

    new Setting(this.contentEl)
      .setName("显示顺序")
      .setDesc("数字越小，显示位置越靠下；例如 3 在 2 上面，1 在最下面。")
      .addText(t => {
        t.inputEl.type = "number";
        t.inputEl.min = "1";
        t.inputEl.step = "1";
        t.setValue(String(sortOrder)).onChange(v => {
          sortOrder = Math.max(1, parseInt(v) || 1);
        });
      });

    new Setting(this.contentEl)
      .setName("卡池类型")
      .addDropdown(d => d
        .addOption("up", "UP池")
        .addOption("standard", "普池")
                .setValue(type)
        .onChange(v => {
          type = v;
          drawUpSetting();
        }));

    const upWrap = this.contentEl.createDiv();

    const drawUpSetting = () => {
      upWrap.empty();
      if (type !== "up") return;

      const upSetting = new Setting(upWrap)
        .setName("UP角色")
        .setDesc("只需设置UP密探，数量不限。其他密探默认来自整个密探图鉴。");

      const selectedWrap = upSetting.controlEl.createDiv({ cls: "pool-character-select" });
      const drawSelected = () => {
        selectedWrap.empty();
        if (!upCharacterIds.length) {
          selectedWrap.createDiv({ cls: "pool-details-hint", text: "尚未设置UP角色" });
          return;
        }
        for (const id of upCharacterIds) {
          const c = this.plugin.data.characters.find(x => x.id === id);
          if (c) selectedWrap.createDiv({ cls: "pool-character-option", text: c.name });
        }
      };
      drawSelected();

      upSetting.addButton(b => b.setButtonText("选择").onClick(() => {
        new CharacterPickerModal(this.app, this.plugin, upCharacterIds, ids => {
          upCharacterIds = ids;
          drawSelected();
        }).open();
      }));
    };

    drawUpSetting();

    const coverSetting = new Setting(this.contentEl)
      .setName("封面图片")
      .setDesc("图片会保存到 Vault/Gacha Tracker/images/，可随坚果云同步。");

    coverSetting.addButton(b => b.setButtonText(cover ? "更换图片" : "选择图片").onClick(async () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        const path = await importImage(this.app, input.files?.[0]);
        if (path) {
          cover = path;
          new Notice("封面已保存");
        }
      };
      input.click();
    }));

    const row = this.contentEl.createDiv({ cls: "modal-button-container" });
    new Setting(row)
      .addButton(b => b.setButtonText("取消").onClick(() => this.close()))
      .addButton(b => b.setButtonText("保存").setCta().onClick(async () => {
        if (!name.trim()) return new Notice("请输入卡池名称");
        if (type === "up" && !upCharacterIds.length) {
          return new Notice("UP池请至少选择1个UP角色");
        }

        await this.onSave({
          ...(this.pool || {}),
          id: this.pool?.id || uid("pool"),
          name: name.trim(),
          type,
          sortOrder,
          upCharacterIds: type === "up" ? upCharacterIds : [],
          records: this.pool?.records || [],
          cover
        });
        this.close();
      }));
  }
}

class GachaView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.openPools = new Set();
    this.filter = "all";
    this.section = "tracker";
    plugin.view = this;
  }
  getViewType() { return VIEW_TYPE_GACHA; }
  getDisplayText() { return "Gacha Tracker"; }
  async onOpen() { this.render(); }
  async onClose() {}

  render() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("gacha-root", "gacha-ipad");

    const top = root.createDiv({ cls: "gacha-top" });
    top.createDiv({ cls: "gacha-title", text: "Gacha Tracker" });

    const nav = top.createDiv({ cls: "gacha-section-tabs" });
    [["tracker","抽卡记录"],["dex","密探图鉴"]].forEach(([value, label]) => {
      const btn = nav.createEl("button", { text: label });
      if (this.section === value) btn.addClass("is-active");
      btn.onclick = () => {
        this.section = value;
        this.render();
      };
    });

    if (this.section === "dex") {
      this.renderDex(root);
      return;
    }

    this.renderTracker(root);
  }

  renderTracker(root) {
    const data = this.plugin.data;
    const allRecords = data.pools.flatMap(p => p.records || []);
    const ssr = allRecords.length;
    const pulls = allRecords.reduce((s, r) => s + Number(r.pulls || 0), 0);

    const upPools = data.pools.filter(p => p.type === "up");
    const upEntries = upPools.flatMap(p => (p.records || []).map(r => ({ pool: p, record: r })));
    const off = upEntries.filter(x => this.plugin.isOffRate(x.pool, x.record.characterId)).length;
    const onRate = upEntries.length ? ((upEntries.length - off) / upEntries.length * 100) : 0;

    const actions = root.createDiv({ cls: "gacha-actions gacha-actions-under-title" });
    new Setting(actions)
      .addButton(b => b.setButtonText("新建卡池").setCta().onClick(() => {
        new PoolModal(this.app, this.plugin, null, async p => {
          data.pools.push(p);
          await this.plugin.saveGachaData();
          this.render();
        }).open();
      }));

    const dash = root.createDiv({ cls: "dashboard" });
    const stats = dash.createDiv({ cls: "dashboard-big-stats" });

    [["总抽数", pulls], ["绝密记录", ssr], ["平均每个绝密", ssr ? pulls / ssr : 0]].forEach(([label, val]) => {
      const s = stats.createDiv({ cls: "big-stat" });
      s.createDiv({
        cls: "big-value",
        text: typeof val === "number" && !Number.isInteger(val) ? val.toFixed(1) : String(val)
      });
      s.createDiv({ cls: "big-label", text: label });
    });

    const highlights = dash.createDiv({ cls: "dashboard-highlights" });
    const h = highlights.createDiv({ cls: "highlight-card" });
    h.createDiv({ cls: "highlight-title", text: "UP池不歪率" });
    h.createDiv({ cls: "highlight-main", text: `${onRate.toFixed(1)}%` });
    h.createDiv({
      cls: "highlight-sub",
      text: upEntries.length ? `共 ${upEntries.length} 次绝密，歪 ${off} 次` : "暂无UP池绝密记录"
    });

    const tabs = root.createDiv({ cls: "gacha-filter-tabs" });
    [["all","全部"],["up","UP池"],["standard","普池"]].forEach(([v,t]) => {
      const b = tabs.createEl("button", { text: t });
      if (this.filter === v) b.addClass("is-active");
      b.onclick = () => {
        this.filter = v;
        this.render();
      };
    });

    const section = root.createDiv({ cls: "pool-list-section" });
    const pools = data.pools
      .filter(p => this.filter === "all" || p.type === this.filter)
      .slice()
      .sort((a, b) => (Number(b.sortOrder) || 0) - (Number(a.sortOrder) || 0));

    if (!pools.length) {
      section.createDiv({ cls: "gacha-empty-inline", text: "还没有卡池，点击“新建卡池”开始记录。" });
    }

    for (const p of pools) this.renderPool(section, p);
  }

  renderDex(root) {
    const header = root.createDiv({ cls: "dex-header" });
    const titleWrap = header.createDiv();
    titleWrap.createEl("h2", { text: "密探图鉴" });
    titleWrap.createDiv({ cls: "dex-subtitle", text: `共 ${this.plugin.data.characters.length} 位密探` });

    const add = header.createEl("button", { text: "新增密探", cls: "mod-cta" });
    add.onclick = () => {
      new CharacterModal(this.app, null, async c => {
        this.plugin.data.characters.push(c);
        await this.plugin.saveGachaData();
        this.render();
      }).open();
    };

    const grid = root.createDiv({ cls: "dex-grid" });

    if (!this.plugin.data.characters.length) {
      grid.createDiv({ cls: "gacha-empty-inline", text: "图鉴还没有密探，点击“新增密探”开始添加。" });
      return;
    }

    for (const c of this.plugin.data.characters) {
      const card = grid.createDiv({ cls: "dex-card" });
      const frame = card.createDiv({ cls: "dex-image-frame" });
      const src = imageSrc(this.app, c.image);

      if (src) {
        const img = frame.createEl("img", { cls: "dex-image" });
        img.src = src;
      } else {
        frame.createDiv({ cls: "dex-image dex-image-placeholder", text: "暂无图片" });
      }

      frame.createDiv({ cls: "dex-badge dex-element", text: c.element || "未设属性" });
      frame.createDiv({ cls: "dex-badge dex-profession", text: c.profession || "未设职业" });

      if (c.keywordLeft) {
        frame.createDiv({ cls: "dex-keyword dex-keyword-left", text: c.keywordLeft });
      }
      if (c.keywordRight) {
        frame.createDiv({ cls: "dex-keyword dex-keyword-right", text: c.keywordRight });
      }

      card.createDiv({ cls: "dex-name", text: c.name });

      const actions = card.createDiv({ cls: "dex-actions" });
      const edit = actions.createEl("button", { text: "编辑" });
      edit.onclick = (ev) => {
        ev.stopPropagation();
        new CharacterModal(this.app, c, async nc => {
          Object.assign(c, nc);
          await this.plugin.saveGachaData();
          this.render();
        }).open();
      };

      const del = actions.createEl("button", { text: "删除" });
      del.onclick = (ev) => {
        ev.stopPropagation();
        new ConfirmModal(this.app, `确定删除「${c.name}」？`, async () => {
          this.plugin.data.characters = this.plugin.data.characters.filter(x => x.id !== c.id);
          for (const p of this.plugin.data.pools) {
            p.upCharacterIds = (p.upCharacterIds || []).filter(id => id !== c.id);
          }
          await this.plugin.saveGachaData();
          this.render();
        }).open();
      };

      card.onclick = () => {
        card.toggleClass("show-actions", !card.hasClass("show-actions"));
      };
    }
  }

  renderPool(parent, pool) {
    const box = parent.createDiv({ cls: "pool-box" });
    const hero = box.createDiv({ cls: "pool-hero" });
    const cover = hero.createDiv({ cls: "pool-cover" });

    const src = imageSrc(this.app, pool.cover);
    if (src) cover.style.backgroundImage = `url("${src}")`;

    const overlay = hero.createDiv({ cls: "pool-overlay" });
    overlay.createDiv({
      cls: "pool-type-badge",
      text: pool.type === "up" ? "UP池" : "普池"
    });
    overlay.createDiv({ cls: "pool-name", text: pool.name });

    const records = pool.records || [];
    overlay.createDiv({
      cls: "pool-stats",
      text: `${records.length} 次绝密 · ${records.reduce((s,r)=>s+Number(r.pulls||0),0)} 抽`
    });

    hero.onclick = () => {
      if (this.openPools.has(pool.id)) this.openPools.delete(pool.id);
      else this.openPools.add(pool.id);
      this.render();
    };

    const actions = box.createDiv({ cls: "pool-actions" });

    new Setting(actions)
      .addButton(b => b.setButtonText("添加记录").setCta().onClick(() => {
        new RecordModal(this.app, this.plugin, pool, null, async r => {
          pool.records.push(r);
          await this.plugin.saveGachaData();
          this.render();
        }).open();
      }));

    new Setting(actions)
      .addButton(b => b.setButtonText("编辑卡池").onClick(() => {
        new PoolModal(this.app, this.plugin, pool, async p => {
          Object.assign(pool, p);
          await this.plugin.saveGachaData();
          this.render();
        }).open();
      }));

    new Setting(actions)
      .addButton(b => b.setButtonText("删除").onClick(() => {
        new ConfirmModal(this.app, `确定删除「${pool.name}」及其记录？`, async () => {
          this.plugin.data.pools = this.plugin.data.pools.filter(x => x.id !== pool.id);
          await this.plugin.saveGachaData();
          this.render();
        }).open();
      }));

    if (pool.type === "up" && (pool.upCharacterIds || []).length) {
      const line = box.createDiv({ cls: "pool-characters-line" });
      line.createDiv({ cls: "up-label", text: "UP" });
      for (const id of pool.upCharacterIds || []) {
        const c = this.plugin.data.characters.find(x => x.id === id);
        if (c) line.createDiv({ cls: "character-chip", text: c.name });
      }
    }

    if (this.openPools.has(pool.id)) {
      const details = box.createDiv({ cls: "pool-details is-open" });
      details.createDiv({ cls: "pool-details-head", text: "抽卡记录" });

      const list = details.createDiv({ cls: "pool-records" });

      if (!records.length) {
        list.createDiv({ cls: "pool-details-hint", text: "暂无记录" });
      }

      records.forEach((r, i) => {
        const c = this.plugin.data.characters.find(x => x.id === r.characterId);
        const off = this.plugin.isOffRate(pool, r.characterId);

        const card = list.createDiv({ cls: "pull-card" });
        if (off) card.addClass("is-off");

        card.createDiv({ cls: "pull-index", text: `#${i + 1}` });

        const avatarWrap = card.createDiv({ cls: "pull-avatar-wrap" });
        const csrc = imageSrc(this.app, c?.image);

        if (csrc) {
          const img = avatarWrap.createEl("img", { cls: "pull-avatar" });
          img.src = csrc;
        } else {
          avatarWrap.createDiv({ cls: "pull-avatar pull-avatar-placeholder", text: "无图" });
        }

        card.createDiv({ cls: "pull-character", text: c?.name || "未知角色" });
        card.createDiv({ cls: "pull-meta", text: `第 ${r.pulls} 抽` });

        if (off) card.createDiv({ cls: "off-badge", text: "歪" });

        const smallActions = card.createDiv({ cls: "pull-actions-compact" });
        const edit = smallActions.createEl("button", { text: "编辑" });
        edit.onclick = (ev) => {
          ev.stopPropagation();
          new RecordModal(this.app, this.plugin, pool, r, async nr => {
            Object.assign(r, nr);
            await this.plugin.saveGachaData();
            this.render();
          }).open();
        };

        const del = smallActions.createEl("button", { text: "删除" });
        del.onclick = (ev) => {
          ev.stopPropagation();
          new ConfirmModal(this.app, "确定删除这条记录？", async () => {
            pool.records = pool.records.filter(x => x.id !== r.id);
            await this.plugin.saveGachaData();
            this.render();
          }).open();
        };

        card.onclick = () => {
          card.toggleClass("show-actions", !card.hasClass("show-actions"));
        };
      });
    }
  }
}

class GachaSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Gacha Tracker" });
    new Setting(this.containerEl)
      .setName("打开记录器")
      .setDesc("在 Obsidian 侧栏打开 Gacha Tracker。")
      .addButton(b => b.setButtonText("打开").setCta().onClick(() => this.plugin.activateView()));
  }
}

class GachaTrackerPlugin extends Plugin {
  async onload() {
    this.data = await super.loadData();
    this.data = this.migrate(this.data);
    await this.saveGachaData();

    this.registerView(VIEW_TYPE_GACHA, leaf => new GachaView(leaf, this));
    this.addRibbonIcon("dice-5", "Gacha Tracker", () => this.activateView());
    this.addCommand({
      id: "open-gacha-tracker",
      name: "打开 Gacha Tracker",
      callback: () => this.activateView()
    });
    this.addSettingTab(new GachaSettingTab(this.app, this));
  }

  migrate(d) {
    d = d && typeof d === "object" ? d : {};
    const out = {
      version: 6,
      characters: Array.isArray(d.characters) ? d.characters : [],
      pools: Array.isArray(d.pools) ? d.pools : []
    };

    const byName = new Map(out.characters.map(c => [c.name, c]));

    for (const c of out.characters) {
      if (typeof c.image !== "string") c.image = "";
      if (typeof c.element !== "string" || !c.element) c.element = "混沌";
      if (typeof c.profession !== "string" || !c.profession) c.profession = "破军";
      if (typeof c.keywordLeft !== "string") c.keywordLeft = "";
      if (typeof c.keywordRight !== "string") c.keywordRight = "";
      delete c.note;
      delete c.notes;
      delete c.remark;
    }

    for (let poolIndex = 0; poolIndex < out.pools.length; poolIndex++) {
      const p = out.pools[poolIndex];
      p.id = p.id || uid("pool");
      p.type = p.type || "up";
      if (!Number.isFinite(Number(p.sortOrder)) || Number(p.sortOrder) < 1) {
        p.sortOrder = poolIndex + 1;
      } else {
        p.sortOrder = Math.max(1, Math.floor(Number(p.sortOrder)));
      }
      if (p.type === "other") p.type = "standard";
      p.records = Array.isArray(p.records) ? p.records : [];

      if (Array.isArray(p.characters)) {
        p.characterIds = Array.isArray(p.characterIds) ? p.characterIds : [];
        for (const old of p.characters) {
          const existing = byName.get(old.name);
          const nc = existing || {
            id: uid("char"),
            name: old.name,
            image: "",
            element: "混沌",
            profession: "破军",
            keywordLeft: "",
            keywordRight: ""
          };
          if (!existing) {
            out.characters.push(nc);
            byName.set(nc.name, nc);
          }
          if (!p.characterIds.includes(nc.id)) p.characterIds.push(nc.id);
        }
      }

      if (!Array.isArray(p.upCharacterIds)) {
        // 兼容旧版：旧 UP 池里的“卡池角色”就是以前默认的 UP 名单。
        p.upCharacterIds = p.type === "up" && Array.isArray(p.characterIds)
          ? [...p.characterIds]
          : [];
      }

      p.upCharacterIds = p.upCharacterIds.filter(id => out.characters.some(c => c.id === id));

      p.records = p.records.map(r => {
        const nr = {
          ...r,
          id: r.id || uid("pull"),
          createdAt: r.createdAt || Date.now()
        };
        delete nr.note;
        return nr;
      });

      delete p.characters;
      delete p.characterIds;
    }

    return out;
  }

  isOffRate(pool, characterId) {
    if (!pool || pool.type !== "up") return false;
    const up = Array.isArray(pool.upCharacterIds) ? pool.upCharacterIds : [];
    if (!up.length) return false;
    return !up.includes(characterId);
  }

  async activateView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GACHA);
    if (leaves.length) return this.app.workspace.revealLeaf(leaves[0]);

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_GACHA, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async saveGachaData() {
    await super.saveData(this.data);
  }
}

module.exports = GachaTrackerPlugin;
