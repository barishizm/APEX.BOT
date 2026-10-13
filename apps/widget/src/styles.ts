// Everything lives inside the shadow root; `all: initial` keeps host-page CSS out.
export const css = `
:host{all:initial}
*{box-sizing:border-box;margin:0}
.root{--bg:#fff;--surface:#f6f6f3;--text:#0c0c09;--muted:#64645c;--line:#e4e4de;--bubble:#f0f0eb;--err:#b42318;--err-bg:#fdf1f0;--ox:var(--cx,20px);--oy:var(--cy,20px);--ls:56px;--pw:384px;--r:16px;--font:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
position:fixed;z-index:2147483000;bottom:var(--oy);right:var(--ox);font:15px/1.5 var(--font);color:var(--text);-webkit-font-smoothing:antialiased}
.root[data-pos=left]{right:auto;left:var(--ox)}
.root.dk{--bg:#171713;--surface:#0f0f0c;--text:#f4f4f1;--muted:#a3a39b;--line:#2c2c25;--bubble:#24241e;--err:#fda29b;--err-bg:#2a1714}
button,input,textarea{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:0;padding:0}
:focus{outline:none}
:focus-visible{outline:2px solid var(--text);outline-offset:2px}
svg{display:block;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.launcher{display:flex;align-items:center;justify-content:center;gap:8px;min-width:var(--ls);height:var(--ls);border-radius:999px;font-weight:600;background:var(--p);color:var(--on-p);box-shadow:0 8px 24px rgba(12,12,9,.24),0 1px 3px rgba(12,12,9,.2);transition:transform .2s ease}
.launcher:hover{transform:scale(1.05)}
.launcher svg{width:calc(var(--ls)*.43);height:calc(var(--ls)*.43)}
.launcher img{width:calc(var(--ls)*.6);height:calc(var(--ls)*.6);object-fit:contain}
.launcher.lbl{padding:0 calc(var(--ls)*.38)}
.teaser{position:absolute;bottom:calc(var(--ls) + 12px);right:0;width:max-content;max-width:260px;padding:9px 32px 9px 13px;background:var(--bg);border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 24px rgba(12,12,9,.14);font-size:14px;text-align:left;animation:pop .22s}
.root[data-pos=left] .teaser{right:auto;left:0}
.teaser .x{position:absolute;top:5px;right:5px;width:22px;height:22px;display:grid;place-items:center;border-radius:6px;color:var(--muted)}
.teaser .x svg{width:14px;height:14px}
.root[data-pos=left] .panel{right:auto;left:0;transform-origin:bottom left}
.panel{position:absolute;bottom:calc(var(--ls) + 16px);right:0;width:var(--pw);max-width:calc(100vw - 2*var(--ox));height:min(640px,calc(100vh - var(--ls) - var(--oy) - 40px));display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:var(--r);box-shadow:0 24px 64px rgba(12,12,9,.18),0 2px 8px rgba(12,12,9,.08);overflow:hidden;transform-origin:bottom right;animation:pop .22s cubic-bezier(.2,.8,.2,1)}
.panel[hidden]{display:none}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.98)}}
.view{flex:1;min-height:0;display:flex;flex-direction:column}
.head{display:flex;align-items:center;gap:10px;padding:12px 10px 12px 14px;border-bottom:1px solid var(--line)}
.avatar{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:50%;overflow:hidden;background:var(--p);color:var(--on-p);font-weight:600;font-size:15px}
.avatar img{width:100%;height:100%;object-fit:cover}
.title{flex:1;min-width:0;line-height:1.25}
.title strong{display:block;font-size:15px;font-weight:600}
.title span{display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.icon{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;color:var(--muted)}
.icon:hover{background:var(--surface);color:var(--text)}
.log{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:16px 14px;display:flex;flex-direction:column;gap:12px}
.msg{max-width:86%;padding:9px 13px;border-radius:16px;overflow-wrap:anywhere}
.user{align-self:flex-end;background:var(--p);color:var(--on-p);border-bottom-right-radius:5px;white-space:pre-wrap}
.bot{align-self:flex-start;background:var(--bubble);border-bottom-left-radius:5px}
.bot p{white-space:pre-wrap}
.bot p+p,.bot p+ul,.bot p+ol,.bot ul+p,.bot ol+p{margin-top:8px}
.bot ul,.bot ol{padding-left:20px;margin:4px 0}
.bot li+li{margin-top:2px}
.bot a{color:inherit;text-underline-offset:2px}
.bot code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--surface);padding:1px 5px;border-radius:5px}
.bot.error{background:var(--err-bg);color:var(--err)}
.meta{align-self:flex-start;max-width:86%;display:flex;flex-direction:column;gap:8px;margin-top:-4px}
.sources{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px}
.sources span{color:var(--muted);margin-right:2px}
.chip{display:inline-flex;max-width:100%;padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:var(--bg);color:var(--text);text-decoration:none;font-size:12.5px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
a.chip:hover,button.chip:hover{background:var(--surface)}
.rate{display:flex;align-items:center;gap:2px;color:var(--muted);font-size:12px}
.rate button{display:grid;place-items:center;width:28px;height:28px;border-radius:8px}
.rate button:hover{background:var(--surface);color:var(--text)}
.rate button[aria-pressed=true]{color:var(--text)}
.rate button[aria-pressed=true] svg{fill:currentColor;fill-opacity:.15}
.rate button:disabled{cursor:default}
.rate svg{width:16px;height:16px}
.typing{display:flex;gap:4px;padding:6px 2px}
.typing i{width:6px;height:6px;border-radius:50%;background:var(--muted);animation:blink 1.2s infinite ease-in-out}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes blink{0%,80%,100%{opacity:.25}40%{opacity:1}}
.suggest{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 12px}
.suggest .chip{font-size:13.5px;padding:6px 12px}
.compose{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--line)}
textarea,input{width:100%;border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:10px 12px;line-height:1.4;font-size:15px}
textarea{resize:none;min-height:44px;max-height:132px;display:block}
textarea:focus,input:focus{border-color:var(--muted)}
textarea::placeholder,input::placeholder{color:var(--muted)}
.send{display:grid;place-items:center;flex:none;width:44px;height:44px;border-radius:12px;background:var(--p);color:var(--on-p)}
.send:disabled{opacity:.35;cursor:default}
.foot{padding:0 14px 10px;font-size:11.5px;line-height:1.5;color:var(--muted);text-align:center}
.foot a,.foot button{color:inherit;text-decoration:underline;text-underline-offset:2px}
.brand{display:block;opacity:.8}
.form{flex:1;overflow-y:auto;padding:22px 18px;display:flex;flex-direction:column;gap:14px}
.form h2{font-size:17px;font-weight:600}
.form p{color:var(--muted);font-size:14px}
.form label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:500}
.form .err{color:var(--err);font-size:13px}
.row{display:flex;gap:8px;margin-top:4px}
.btn{padding:10px 16px;border-radius:10px;font-weight:500;font-size:14px}
.btn.primary{background:var(--p);color:var(--on-p)}
.btn.ghost{border:1px solid var(--line)}
.btn:disabled{opacity:.5;cursor:default}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:480px){
.root{--ox:min(var(--cx,20px),16px);--oy:min(var(--cy,20px),16px)}
.root:not([data-float]) .panel{position:fixed;inset:0;width:auto;max-width:none;height:auto;border:0;border-radius:0;padding-bottom:env(safe-area-inset-bottom)}
.root[data-open]:not([data-float]) .launcher{display:none}
textarea,input{font-size:16px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
