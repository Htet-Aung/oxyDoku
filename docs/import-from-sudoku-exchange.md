# Importing Your Exact Current Position from Sudoku Exchange

When solving a puzzle on [Sudoku Exchange](https://sudokuexchange.com/play/), the site's built-in **Share this puzzle** link (`?s=...`) only contains the 81 starting givens—it does **not** include the digits you have already entered, your corner ("outer") pencil marks, your centre ("inner") pencil marks, or your cell colours.

Pattern Lab (`sudokUI`) provides a local-first **Send to Pattern Lab** bookmarklet (`src/content/sudokuExchangeImport.ts`) that reads your live Sudoku Exchange board directly in your browser and opens your local Pattern Lab tab with your **exact current position** ready to scan.

---

## 1. Prerequisites

1. Start your local Pattern Lab application:
   ```powershell
   npm.cmd run dev
   ```
   By default, Vite serves Pattern Lab at `http://localhost:5173`.
2. A desktop browser (Chrome, Edge, Firefox, Brave, or Safari) with the Bookmarks Bar visible (`Ctrl+Shift+B` / `Cmd+Shift+B`).

> [!NOTE]
> All extraction, encoding, validation, and pattern scanning run **100% locally** inside your browser. No puzzle state or candidate data is ever uploaded to a remote server, and the payload is passed in the URL hash fragment (`#import-position=<payload>`) so it is never transmitted in an HTTP request.

---

## 2. One-Time Bookmarklet Setup

1. Show your browser's **Bookmarks Bar** (`Ctrl+Shift+B` on Windows/Linux, `Cmd+Shift+B` on macOS).
2. Right-click the Bookmarks Bar and choose **Add page...** or **Add bookmark...**.
3. Set the **Name** to:
   ```text
   Send to Pattern Lab
   ```
4. Set the **URL** to the following `javascript:` bookmarklet code (targeting `http://localhost:5173`):

```javascript
javascript:(function(){try{var bit=function(d){return 1<<(d-1)};var p=null;var root=document.getElementById("root");var g=null;if(root){var rk=Object.keys(root).find(function(k){return k.indexOf("__reactContainer")===0||k.indexOf("__reactFiber")===0});if(rk&&root[rk]){var hr=root[rk].stateNode&&root[rk].stateNode.current||root[rk];var st=[hr];while(st.length){var n=st.pop();if(!n)continue;if(n.memoizedProps&&n.memoizedProps.grid&&n.memoizedProps.grid.toObject){g=n.memoizedProps.grid.toObject();break}if(n.sibling)st.push(n.sibling);if(n.child)st.push(n.child)}}}if(!g){var ge=document.getElementById("main-grid");if(ge){var fk=Object.keys(ge).find(function(k){return k.indexOf("__reactFiber")===0});if(fk&&ge[fk]){var fa=ge[fk],fb=fa.alternate;var oa=fa.return&&fa.return.memoizedProps&&fa.return.memoizedProps.grid&&fa.return.memoizedProps.grid.toObject();var ob=fb&&fb.return&&fb.return.memoizedProps&&fb.return.memoizedProps.grid&&fb.return.memoizedProps.grid.toObject();g=oa&&ob?((ob.undoList&&ob.undoList.size||0)>=(oa.undoList&&oa.undoList.size||0)?ob:oa):oa||ob}}}if(g&&g.cells){var ca=g.cells.toArray?g.cells.toArray():Array.from(g.cells);if(ca.length===81){var gv="",vl="",co=new Array(81).fill(0),ce=new Array(81).fill(0),cl=new Array(81).fill(0);for(var i=0;i<81;i++){var c=ca[i].toObject?ca[i].toObject():ca[i];var d=c.digit>="1"&&c.digit<="9"?c.digit:"0";gv+=c.isGiven&&d!=="0"?d:"0";vl+=d;if(d==="0"){var op=c.outerPencils&&c.outerPencils.toArray?c.outerPencils.toArray():Array.isArray(c.outerPencils)?c.outerPencils:Array.from(c.outerPencils||[]);var ip=c.innerPencils&&c.innerPencils.toArray?c.innerPencils.toArray():Array.isArray(c.innerPencils)?c.innerPencils:Array.from(c.innerPencils||[]);op.forEach(function(x){co[i]|=bit(+x)});ip.forEach(function(x){ce[i]|=bit(+x)})}var cc=+(c.colorCode||1);if(cc>=2&&cc<=9)cl[i]=cc-1}var hc=co.some(Boolean),hn=ce.some(Boolean),hl=cl.some(Boolean);p={v:1,source:"sudokuexchange",fidelity:hc||hn?"full":"grid-only",givens:gv,values:vl};if(hc)p.corner=co;if(hn)p.center=ce;if(hl)p.colors=cl}}if(!p&&window.localStorage){var bs=null;for(var k=0;k<localStorage.length;k++){var ky=localStorage.key(k);if(ky&&ky.indexOf("save-")===0){try{var sv=JSON.parse(localStorage.getItem(ky)||"{}");if(sv&&sv.initialDigits&&sv.initialDigits.length===81&&(!bs||(sv.lastUpdatedTime||0)>=(bs.lastUpdatedTime||0)))bs=sv}catch(_){}}}if(bs){var gvs=bs.initialDigits.replace(/\./g,"0"),vls=gvs.split(""),cos=new Array(81).fill(0),ces=new Array(81).fill(0),cls=new Array(81).fill(0);(bs.currentSnapshot||"").split(",").forEach(function(pt){if(pt.length<3)return;var idx=(+pt[0]-1)*9+(+pt[1]-1);if(idx<0||idx>=81)return;var ig=gvs[idx]>="1"&&gvs[idx]<="9",md=null;for(var j=2;j<pt.length;j++){var ch=pt[j];if(ch==="D"){var dg=pt[++j];if(!ig&&dg>="1"&&dg<="9"){vls[idx]=dg;cos[idx]=0;ces[idx]=0}md=null}else if(ch==="C"){var c2=+pt[++j];if(c2>=2&&c2<=9)cls[idx]=c2-1;md=null}else if(ch==="T"||ch==="N"){md=ch}else if(ch>="1"&&ch<="9"&&!ig&&vls[idx]==="0"){if(md==="T")cos[idx]|=bit(+ch);else if(md==="N")ces[idx]|=bit(+ch)}}});var hcs=cos.some(Boolean),hns=ces.some(Boolean),hls=cls.some(Boolean);p={v:1,source:"sudokuexchange",fidelity:hcs||hns?"full":"grid-only",givens:gvs,values:vls.join("")};if(hcs)p.corner=cos;if(hns)p.center=ces;if(hls)p.colors=cls}}if(!p){var bgs=document.querySelectorAll("#main-grid svg g.cell-bg[data-cell-index]");if(bgs.length===81){var ga=new Array(81).fill(false),gv2=new Array(81).fill("0"),vl2=new Array(81).fill("0"),co2=new Array(81).fill(0),ce2=new Array(81).fill(0),cl2=new Array(81).fill(0),x0=50,y0=50,sz=100;bgs.forEach(function(el){var idx=+el.getAttribute("data-cell-index");ga[idx]=el.classList.contains("given");var r=el.querySelector("rect");if(r){if(idx===0){x0=+r.getAttribute("x")||50;y0=+r.getAttribute("y")||50;sz=+r.getAttribute("width")||100}var m=(r.getAttribute("class")||"").match(/color-code-(\d)/);if(m&&+m[1]>=2)cl2[idx]=+m[1]-1}});var at=function(el){var c=Math.floor((+el.getAttribute("x")-x0)/sz),r=Math.floor((+el.getAttribute("y")-y0)/sz);return r>=0&&r<9&&c>=0&&c<9?r*9+c:-1};document.querySelectorAll("#main-grid svg text.digit").forEach(function(t){var idx=at(t),d=(t.textContent||"").trim();if(idx>=0&&d>="1"&&d<="9"){vl2[idx]=d;if(t.classList.contains("given")||ga[idx])gv2[idx]=d}});document.querySelectorAll("#main-grid svg text.inner-pencil").forEach(function(t){var idx=at(t);if(idx>=0&&vl2[idx]==="0")Array.from((t.textContent||"").trim()).forEach(function(ch){if(ch>="1"&&ch<="9")ce2[idx]|=bit(+ch)})});document.querySelectorAll("#main-grid svg g.outer-pencil text").forEach(function(t){var idx=at(t);if(idx>=0&&vl2[idx]==="0")Array.from((t.textContent||"").trim()).forEach(function(ch){if(ch>="1"&&ch<="9")co2[idx]|=bit(+ch)})});var hc2=co2.some(Boolean),hn2=ce2.some(Boolean),hl2=cl2.some(Boolean);p={v:1,source:"sudokuexchange",fidelity:hc2||hn2?"full":"grid-only",givens:gv2.join(""),values:vl2.join("")};if(hc2)p.corner=co2;if(hn2)p.center=ce2;if(hl2)p.colors=cl2}}if(!p){alert("Send to Pattern Lab: Could not find an active Sudoku Exchange board on this page.");return}var b64=btoa(JSON.stringify(p)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");var url="http://localhost:5173"+"/#import-position="+b64;var w=window.open(url,"_blank");if(!w)prompt("Popup blocked. Copy this Pattern Lab import link:",url)}catch(e){alert("Send to Pattern Lab error: "+(e&&e.message||e))}})();
```

*(If you run Pattern Lab on a different port, replace `"http://localhost:5173"` near the end of the snippet with your local origin, or call `buildSudokuExchangeBookmarklet('http://localhost:YOUR_PORT')` from `src/content/sudokuExchangeImport.ts`.)*

---

## 3. How to Use It on Sudoku Exchange

1. Open any classic 9×9 puzzle on [Sudoku Exchange](https://sudokuexchange.com/play/).
2. Solve normally—enter digits, add outer/corner or inner/centre pencil marks, or use **Auto calculate candidates** and eliminate candidates as you go.
3. Whenever you get stuck or want to inspect the patterns available in the current position, click **Send to Pattern Lab** on your Bookmarks Bar.
4. Your Sudoku Exchange tab stays open and untouched, and a new tab opens at `http://localhost:5173/#import-position=<payload>` with your position loaded.
5. Click **Scan** (or **Import & scan patterns** if confirming over an existing game) to inspect every pattern instance available in your exact position without mutating the board.

---

## 4. What Is Transferred & Import Fidelity

The adapter extracts state using three redundant layers on Sudoku Exchange (live React state on `#root`/`#main-grid`, saved `localStorage` snapshot `save-<initialDigits>`, and the rendered `#main-grid svg` DOM):

| Board Element on Sudoku Exchange | Transferred to Pattern Lab (`sudokUI`) | Notes |
| --- | --- | --- |
| **Original givens** (`initialDigits` / `.given`) | Yes (`cell.given = true`, `cell.value = 1..9`) | Validated for 17+ clues, no house conflicts, and a unique solution. |
| **Player-entered digits** (`digit` on non-given cells / `D<digit>`) | Yes (`cell.given = false`, `cell.value = 1..9`) | Checked for house conflicts; editable and undoable separately from givens. |
| **Outer pencil marks** (`outerPencils` / `T<digits>`) | Yes (`cell.corner` 9-bit mask) | Preserved as corner marks on empty cells. |
| **Inner pencil marks** (`innerPencils` / `N<digits>`, including **Auto calculate candidates**) | Yes (`cell.center` 9-bit mask + `cell.excluded`) | Preserved as centre marks; candidate eliminations relative to canonical candidates are also recorded in `cell.excluded`. |
| **Cell background colours** (`colorCode 2..9` / `C<color>`) | Yes (`cell.colors`) | Mapped to Pattern Lab's cell colour palette (`0..7`). |
| **Timer / undo history on Sudoku Exchange** | Not transferred | Pattern Lab starts a fresh session from the imported position (`info.fromPosition = true`). |

### Honest Fidelity Reporting

Pattern Lab distinguishes three import modes and reports which one occurred in the status toast/dialog:

1. **Full-position import (`fidelity: 'full'`)**
   - Original givens, player-entered digits, and candidate pencil marks (`corner` / `center` / `excluded`) were present and preserved.
   - Pattern scanning reasons over your exact candidate state without recalculating or overwriting your eliminations.
2. **Grid-only import (`fidelity: 'grid-only'`)**
   - Original givens and player-entered digits were preserved, but no candidate pencil marks were present on the source board.
   - Pattern Lab turns **Auto candidates** on (`autoCandidates = true`) and explicitly informs you that candidates were recalculated from the current grid.
3. **Starting-puzzle import**
   - Used when you paste an ordinary Sudoku Exchange share URL (`https://sudokuexchange.com/play/?s=...`) into the **Import** dialog (`src/content/importLinks.ts`). Only the 81 initial givens are imported.

---

## 5. Troubleshooting

- **"Send to Pattern Lab: Could not find an active Sudoku Exchange board on this page."**
  Make sure you are on `https://sudokuexchange.com/play/` with a puzzle currently open on the board (not on the home page or about page).
- **Popup blocked by browser**
  If your browser blocks `window.open`, the bookmarklet automatically opens a copy prompt containing the full `http://localhost:5173/#import-position=...` URL. Copy that URL and either paste it into your browser's address bar or paste it directly into Pattern Lab's **Import** dialog.
- **Confirmation dialog appears in Pattern Lab (`Import position from Sudoku Exchange?`)**
  If you already had an in-progress puzzle in Pattern Lab, the app will never silently overwrite it. Choose **Import & scan patterns** or **Import position** to replace the current board, or **Cancel** to keep your existing game.
- **Conflicting entries or invalid puzzle error**
  If a player-entered digit on Sudoku Exchange directly conflicts with another digit in the same row, column, or box, Pattern Lab rejects the import with a clear conflict message (`Conflicting entries: two Xs share a row, column or box.`) rather than loading a broken state. Fix the duplicate digit on Sudoku Exchange and click the bookmarklet again.
