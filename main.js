const { Plugin, ItemView, Modal, Notice, Setting, TFile } = require("obsidian");

const VIEW_TYPE = "gacha-tracker-view";

class GachaTrackerView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Gacha Tracker"; }
  getIcon() { return "dice"; }
  async onOpen() { await this.render(); }
  async render() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("gacha-tracker-view");

    const toolbar = root.createDiv({ cls:"gacha-toolbar" });
    const mkbtn=(txt,cb)=>{ const b=toolbar.createEl("button",{text:txt}); b.onclick=cb; return b; };
    mkbtn("添加角色",()=>new CharacterModal(this.app,this.plugin,null,()=>this.render()).open());
    mkbtn("新建卡池",()=>new PoolModal(this.app,this.plugin,null,()=>this.render()).open());

    const charsSec = root.createDiv({ cls:"gacha-section" });
    charsSec.createEl("h3",{text:"角色库"});
    const grid = charsSec.createDiv({ cls:"gacha-card-grid" });
    for (const c of this.plugin.data.characters) {
      const card = grid.createDiv({cls:"gacha-char-card"});
      if (c.image) {
        const img = card.createEl("img");
        img.src = this.plugin.resourcePath(c.image);
      } else card.createDiv({cls:"gacha-char-placeholder",text:"无图片"});
      card.createDiv({text:c.name});
      const edit=card.createEl("button",{text:"编辑"});
      edit.onclick=()=>new CharacterModal(this.app,this.plugin,c,()=>this.render()).open();
    }

    const poolSec = root.createDiv({ cls:"gacha-section" });
    poolSec.createEl("h3",{text:"卡池"});
    for (const p of this.plugin.data.pools) {
      const box = poolSec.createDiv({cls:"gacha-pool-card"});
      const head = box.createDiv({cls:"gacha-pool-head"});
      if (p.cover) {
        const img = head.createEl("img");
        img.src = this.plugin.resourcePath(p.cover);
      }
      const meta=head.createDiv({cls:"gacha-pool-meta"});
      meta.createDiv({cls:"gacha-pool-title",text:p.name});
      meta.createDiv({text:`${p.type==="up"?"UP池":p.type==="standard"?"普池":"其他池"} · ${p.records.length} 条记录`});
      const controls = head.createDiv();
      const add = controls.createEl("button",{text:"记录"});
      add.onclick=(ev)=>{ev.stopPropagation();new RecordModal(this.app,this.plugin,p,()=>this.render()).open();};
      const edit = controls.createEl("button",{text:"编辑"});
      edit.onclick=(ev)=>{ev.stopPropagation();new PoolModal(this.app,this.plugin,p,()=>this.render()).open();};

      const records = box.createDiv({cls:"gacha-records"});
      records.style.display = p.expanded ? "grid" : "none";
      head.onclick=async()=>{p.expanded=!p.expanded;await this.plugin.saveGachaData();await this.render();};

      p.records.forEach((r, idx)=>{
        const c=this.plugin.data.characters.find(x=>x.id===r.characterId);
        const isOff=this.plugin.isOffRate(p,r.characterId);
        const rc=records.createDiv({cls:"gacha-record"+(isOff?" offrate":"")});
        if (c?.image) {
          const img=rc.createEl("img");
          img.src=this.plugin.resourcePath(c.image);
        } else rc.createDiv({cls:"placeholder",text:"无图"});
        rc.createDiv({cls:"gacha-record-name",text:c?.name || "未知角色"});
        rc.createDiv({cls:"gacha-record-pull",text:`第 ${r.pulls ?? idx+1} 抽`});
        if (isOff) rc.createDiv({cls:"gacha-badge",text:"歪"});
      });
    }
  }
}

class CharacterModal extends Modal {
  constructor(app,plugin,char,onDone){ super(app); this.plugin=plugin; this.char=char; this.onDone=onDone; this.name=char?.name||""; this.image=char?.image||""; }
  onOpen(){
    const {contentEl}=this; contentEl.empty(); contentEl.createEl("h3",{text:this.char?"编辑角色":"添加角色"});
    new Setting(contentEl).setName("角色名").addText(t=>t.setValue(this.name).onChange(v=>this.name=v));
    new Setting(contentEl).setName("角色图片").setDesc("从 iPad/文件中选择图片").addButton(b=>b.setButtonText("导入图片").onClick(async()=>{
      const input=document.createElement("input"); input.type="file"; input.accept="image/*";
      input.onchange=async()=>{
        const f=input.files?.[0]; if(!f)return;
        const ab=await f.arrayBuffer();
        const ext=(f.name.split(".").pop()||"png").toLowerCase();
        const safe=(this.name||"character").replace(/[\\/:*?"<>|]/g,"_");
        const path=`Gacha Tracker/images/characters/${Date.now()}-${safe}.${ext}`;
        await this.plugin.ensureFolder("Gacha Tracker/images/characters");
        await this.app.vault.createBinary(path,ab);
        this.image=path; new Notice("角色图片已导入");
      };
      input.click();
    }));
    new Setting(contentEl).addButton(b=>b.setCta().setButtonText("保存").onClick(async()=>{
      if(!this.name.trim()) return new Notice("请输入角色名");
      if(this.char){ this.char.name=this.name.trim(); this.char.image=this.image; }
      else this.plugin.data.characters.push({id:crypto.randomUUID(),name:this.name.trim(),image:this.image});
      await this.plugin.saveGachaData(); this.close(); this.onDone?.();
    }));
  }
  onClose(){this.contentEl.empty();}
}

class PoolModal extends Modal {
  constructor(app,plugin,pool,onDone){ super(app); this.plugin=plugin; this.pool=pool; this.onDone=onDone;
    this.name=pool?.name||""; this.type=pool?.type||"up"; this.cover=pool?.cover||""; this.upIds=new Set(pool?.upCharacterIds||[]);
  }
  onOpen(){
    const {contentEl}=this; contentEl.empty(); contentEl.createEl("h3",{text:this.pool?"编辑卡池":"新建卡池"});
    new Setting(contentEl).setName("卡池名称").addText(t=>t.setValue(this.name).onChange(v=>this.name=v));
    new Setting(contentEl).setName("卡池类型").addDropdown(d=>d
      .addOption("up","UP池").addOption("standard","普池").addOption("other","其他池")
      .setValue(this.type).onChange(v=>{this.type=v; this.renderUpSection();}));
    new Setting(contentEl).setName("卡池封面").addButton(b=>b.setButtonText("导入封面").onClick(async()=>{
      const input=document.createElement("input"); input.type="file"; input.accept="image/*";
      input.onchange=async()=>{
        const f=input.files?.[0]; if(!f)return;
        const ab=await f.arrayBuffer(); const ext=(f.name.split(".").pop()||"png").toLowerCase();
        const path=`Gacha Tracker/images/pools/${Date.now()}-cover.${ext}`;
        await this.plugin.ensureFolder("Gacha Tracker/images/pools");
        await this.app.vault.createBinary(path,ab); this.cover=path; new Notice("封面已导入");
      }; input.click();
    }));
    this.upWrap=contentEl.createDiv();
    this.renderUpSection();
    new Setting(contentEl).addButton(b=>b.setCta().setButtonText("保存").onClick(async()=>{
      if(!this.name.trim()) return new Notice("请输入卡池名称");
      const upIds=[...this.upIds];
      if(this.pool){ Object.assign(this.pool,{name:this.name.trim(),type:this.type,cover:this.cover,upCharacterIds:upIds}); }
      else this.plugin.data.pools.push({id:crypto.randomUUID(),name:this.name.trim(),type:this.type,cover:this.cover,upCharacterIds:upIds,records:[],expanded:false});
      await this.plugin.saveGachaData(); this.close(); this.onDone?.();
    }));
  }
  renderUpSection(){
    if(!this.upWrap)return; this.upWrap.empty();
    if(this.type==="standard") return;
    this.upWrap.createEl("h4",{text:"UP角色"});
    this.upWrap.createEl("div",{text:"这里只设置UP角色；抽卡时可直接从整个角色库选择。"});
    const list=this.upWrap.createDiv({cls:"gacha-checkbox-list"});
    for(const c of this.plugin.data.characters){
      const row=list.createDiv({cls:"gacha-checkbox-row"});
      const cb=row.createEl("input"); cb.type="checkbox"; cb.checked=this.upIds.has(c.id);
      cb.onchange=()=>cb.checked?this.upIds.add(c.id):this.upIds.delete(c.id);
      row.createSpan({text:c.name});
    }
  }
  onClose(){this.contentEl.empty();}
}

class RecordModal extends Modal {
  constructor(app,plugin,pool,onDone){ super(app); this.plugin=plugin; this.pool=pool; this.onDone=onDone; this.characterId=""; this.pulls=""; }
  onOpen(){
    const {contentEl}=this; contentEl.empty(); contentEl.createEl("h3",{text:`记录抽卡 · ${this.pool.name}`});
    new Setting(contentEl).setName("角色").addDropdown(d=>{
      d.addOption("","请选择角色");
      for(const c of this.plugin.data.characters) d.addOption(c.id,c.name);
      d.onChange(v=>this.characterId=v);
    });
    new Setting(contentEl).setName("抽数").setDesc("例如：75").addText(t=>{t.inputEl.type="number"; t.onChange(v=>this.pulls=v);});
    new Setting(contentEl).addButton(b=>b.setCta().setButtonText("保存记录").onClick(async()=>{
      if(!this.characterId) return new Notice("请选择角色");
      const pulls=parseInt(this.pulls||"0",10);
      this.pool.records.push({id:crypto.randomUUID(),characterId:this.characterId,pulls:Number.isFinite(pulls)&&pulls>0?pulls:this.pool.records.length+1});
      await this.plugin.saveGachaData(); this.close(); this.onDone?.();
    }));
  }
  onClose(){this.contentEl.empty();}
}

module.exports = class GachaTrackerPlugin extends Plugin {
  async onload() {
    await this.loadGachaData();
    this.registerView(VIEW_TYPE, leaf=>new GachaTrackerView(leaf,this));
    this.addRibbonIcon("dice","Gacha Tracker",()=>this.activateView());
    this.addCommand({id:"open-gacha-tracker",name:"打开 Gacha Tracker",callback:()=>this.activateView()});
  }

  async activateView() {
    let leaf=this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if(!leaf){
      leaf=this.app.workspace.getLeaf(true);
      await leaf.setViewState({type:VIEW_TYPE,active:true});
    }
    this.app.workspace.revealLeaf(leaf);
  }

  async loadGachaData(){
    const raw=await super.loadData();
    this.data=raw && typeof raw==="object" ? raw : {};
    if(!Array.isArray(this.data.characters)) this.data.characters=[];
    if(!Array.isArray(this.data.pools)) this.data.pools=[];

    // 兼容旧数据
    for(const c of this.data.characters){
      if(c.image===undefined) c.image="";
      delete c.note;
      delete c.notes;
      delete c.remark;
    }
    for(const p of this.data.pools){
      if(!Array.isArray(p.records)) p.records=[];
      if(!Array.isArray(p.upCharacterIds)){
        if(Array.isArray(p.characters)) p.upCharacterIds=[...p.characters];
        else if(Array.isArray(p.characterIds) && p.type==="up") p.upCharacterIds=[...p.characterIds];
        else p.upCharacterIds=[];
      }
      delete p.characters;
      delete p.characterIds;
    }
    await this.saveGachaData();
  }

  async saveGachaData(){ await super.saveData(this.data); }

  isOffRate(pool, characterId){
    if(pool.type==="standard") return false;
    const up=Array.isArray(pool.upCharacterIds)?pool.upCharacterIds:[];
    if(up.length===0) return false;
    return !up.includes(characterId);
  }

  resourcePath(path){
    try{
      const f=this.app.vault.getAbstractFileByPath(path);
      return f instanceof TFile ? this.app.vault.getResourcePath(f) : "";
    }catch(e){ return ""; }
  }

  async ensureFolder(path){
    const parts=path.split("/");
    let cur="";
    for(const part of parts){
      cur=cur?`${cur}/${part}`:part;
      if(!this.app.vault.getAbstractFileByPath(cur)){
        try{ await this.app.vault.createFolder(cur); }catch(e){}
      }
    }
  }

  onunload(){ this.app.workspace.detachLeavesOfType(VIEW_TYPE); }
}
