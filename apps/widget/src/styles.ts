// Everything lives inside the shadow root; `all: initial` keeps host-page CSS out.
export const css = `
:host{all:initial}
*{box-sizing:border-box;margin:0}
.root{--bg:#fff;--surface:#f6f6f3;--text:#0c0c09;--muted:#64645c;--line:#e4e4de;--bubble:#f0f0eb;--err:#b42318;--err-bg:#fdf1f0;--ox:var(--cx,20px);--oy:var(--cy,20px);--ls:56px;--pw:384px;--r:16px;--ease:cubic-bezier(.2,.8,.2,1);--font:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
position:fixed;z-index:2147483000;bottom:var(--oy);right:var(--ox);font:15px/1.5 var(--font);color:var(--text);-webkit-font-smoothing:antialiased}
.root[data-pos=left]{right:auto;left:var(--ox)}
.root.dk{--bg:#171713;--surface:#0f0f0c;--text:#f4f4f1;--muted:#a3a39b;--line:#2c2c25;--bubble:#24241e;--err:#fda29b;--err-bg:#2a1714}
button,input,textarea{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:0;padding:0}
:focus{outline:none}
:focus-visible{outline:2px solid var(--text);outline-offset:2px}
svg{display:block;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.launcher{display:flex;align-items:center;justify-content:center;gap:8px;min-width:var(--ls);height:var(--ls);border-radius:999px;font-weight:600;background:var(--p);color:var(--on-p);box-shadow:0 8px 24px rgba(12,12,9,.24),0 1px 3px rgba(12,12,9,.2);transition:transform .25s var(--ease),box-shadow .25s var(--ease);-webkit-tap-highlight-color:transparent}
.launcher:hover{transform:scale(1.05);box-shadow:0 12px 30px rgba(12,12,9,.28),0 2px 4px rgba(12,12,9,.2)}
.launcher:active{transform:scale(.95);transition-duration:.1s}
.launcher>svg,.launcher>img{animation:spin .32s var(--ease)}
@keyframes spin{from{opacity:0;transform:rotate(-60deg) scale(.6)}}
.launcher svg{width:calc(var(--ls)*.43);height:calc(var(--ls)*.43)}
.launcher img{width:calc(var(--ls)*.6);height:calc(var(--ls)*.6);object-fit:contain}
.launcher.lbl{padding:0 calc(var(--ls)*.38)}
.teaser{position:absolute;bottom:calc(var(--ls) + 12px);right:0;width:max-content;max-width:260px;padding:9px 32px 9px 13px;background:var(--bg);border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 24px rgba(12,12,9,.14);font-size:14px;text-align:left;animation:pop .26s var(--ease)}
.teaser.out{animation:out .18s ease forwards}
.root[data-pos=left] .teaser{right:auto;left:0}
.teaser .x{position:absolute;top:5px;right:5px;width:22px;height:22px;display:grid;place-items:center;border-radius:6px;color:var(--muted)}
.teaser .x svg{width:14px;height:14px}
.root[data-pos=left] .panel{right:auto;left:0;transform-origin:bottom left}
.panel{position:absolute;bottom:calc(var(--ls) + 16px);right:0;width:var(--pw);max-width:calc(100vw - 2*var(--ox));height:min(640px,calc(100vh - var(--ls) - var(--oy) - 40px));display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:var(--r);box-shadow:0 24px 64px rgba(12,12,9,.18),0 2px 8px rgba(12,12,9,.08);overflow:hidden;transform-origin:bottom right;
opacity:0;transform:translateY(10px) scale(.96);pointer-events:none;transition:opacity .16s ease,transform .22s cubic-bezier(.4,0,1,1)}
.root[data-open] .panel{opacity:1;transform:none;pointer-events:auto;transition:opacity .2s ease,transform .32s cubic-bezier(.2,.9,.3,1.04)}
.panel[hidden]{display:none}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.98)}}
@keyframes rise{from{opacity:0;transform:translateY(8px) scale(.97)}}
@keyframes fade{from{opacity:0}}
@keyframes out{to{opacity:0;transform:translateY(4px)}}
@keyframes up{from{transform:translateY(100%)}}
@keyframes down{to{transform:translateY(100%)}}
.view{flex:1;min-height:0;display:flex;flex-direction:column}
.head{display:flex;align-items:center;gap:10px;padding:12px 10px 12px 14px;border-bottom:1px solid var(--line)}
.avatar{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:50%;overflow:hidden;background:var(--p);color:var(--on-p);font-weight:600;font-size:15px}
.avatar img{width:100%;height:100%;object-fit:cover}
.title{flex:1;min-width:0;line-height:1.25}
.title strong{display:block;font-size:15px;font-weight:600}
.title span{display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.icon{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:9px;color:var(--muted);transition:background-color .15s,color .15s}
.icon:hover,.icon[aria-expanded=true]{background:var(--surface);color:var(--text)}
.mw{position:relative}
.menu{position:absolute;top:calc(100% + 6px);right:-38px;z-index:3;min-width:220px;padding:5px;display:flex;flex-direction:column;gap:1px;background:var(--bg);border:1px solid var(--line);border-radius:12px;box-shadow:0 14px 36px rgba(12,12,9,.16),0 2px 6px rgba(12,12,9,.08);transform-origin:top right;opacity:0;visibility:hidden;transform:translateY(-4px) scale(.96);transition:opacity .12s ease,transform .14s ease,visibility 0s .14s}
.menu.on{opacity:1;visibility:visible;transform:none;transition:opacity .16s ease,transform .22s var(--ease),visibility 0s}
.item{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:8px;font-size:14px;line-height:1.3;text-align:left;white-space:nowrap;transition:background-color .12s}
.item svg{width:18px;height:18px;flex:none;color:var(--muted)}
.item:hover:not(:disabled),.item:focus-visible{background:var(--surface);outline:none}
.item:disabled{opacity:.4;cursor:default}
.item[hidden]{display:none}
.count{margin-left:auto;min-width:20px;padding:0 6px;border-radius:999px;background:var(--bubble);color:var(--muted);font-size:11.5px;font-weight:600;line-height:20px;text-align:center}
.count:empty{display:none}
.lw{position:relative;flex:1;min-height:0;display:flex;flex-direction:column}
.log{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:16px 14px;display:flex;flex-direction:column;gap:12px}
.jump{position:absolute;left:50%;bottom:10px;width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:var(--bg);border:1px solid var(--line);box-shadow:0 6px 16px rgba(12,12,9,.14);color:var(--text);opacity:0;visibility:hidden;transform:translate(-50%,8px);transition:opacity .16s ease,transform .22s var(--ease),visibility 0s .22s}
.jump.on{opacity:1;visibility:visible;transform:translate(-50%,0);transition-delay:0s}
.jump svg{width:18px;height:18px}
.in{animation:rise .32s var(--ease) both}
.user.in{transform-origin:100% 100%}
.bot.in{transform-origin:0 100%}
.meta.in{animation:fade .3s ease both}
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
.chip{transition:background-color .15s;display:inline-flex;max-width:100%;padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:var(--bg);color:var(--text);text-decoration:none;font-size:12.5px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
a.chip:hover,button.chip:hover{background:var(--surface)}
.rate{display:flex;align-items:center;gap:2px;color:var(--muted);font-size:12px}
.rate button{display:grid;place-items:center;width:28px;height:28px;border-radius:8px}
.rate button:hover{background:var(--surface);color:var(--text)}
.rate button[aria-pressed=true]{color:var(--text)}
.rate button[aria-pressed=true] svg{fill:currentColor;fill-opacity:.15}
.rate button:disabled{cursor:default}
.rate svg{width:16px;height:16px}
.typing{display:flex;gap:4px;padding:6px 2px}
.typing{animation:fade .2s ease .1s both}
.typing i{width:6px;height:6px;border-radius:50%;background:var(--muted);animation:bob 1.2s infinite ease-in-out}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes bob{0%,60%,100%{transform:none;opacity:.35}30%{transform:translateY(-3px);opacity:1}}
.suggest{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 12px}
.suggest .chip{font-size:13.5px;padding:6px 12px;animation:rise .32s var(--ease) both}
.suggest .chip:nth-child(2){animation-delay:.05s}.suggest .chip:nth-child(3){animation-delay:.1s}.suggest .chip:nth-child(4){animation-delay:.15s}
.compose{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--line)}
textarea,input{width:100%;border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:10px 12px;line-height:1.4;font-size:15px;transition:border-color .15s}
textarea{resize:none;min-height:44px;max-height:132px;display:block}
textarea:focus,input:focus{border-color:var(--muted)}
textarea::placeholder,input::placeholder{color:var(--muted)}
.send{display:grid;place-items:center;flex:none;width:44px;height:44px;border-radius:12px;background:var(--p);color:var(--on-p);transition:opacity .18s ease,transform .18s var(--ease)}
.send:not(:disabled):active{transform:scale(.9)}
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
.btn{padding:10px 16px;border-radius:10px;font-weight:500;font-size:14px;transition:background-color .15s,opacity .15s,transform .15s var(--ease)}
.btn:not(:disabled):active{transform:scale(.97)}
.btn.primary{background:var(--p);color:var(--on-p)}
.btn.ghost{border:1px solid var(--line)}
.btn.ghost:hover{background:var(--surface)}
.btn.danger{background:var(--err);color:var(--bg)}
.btn:disabled{opacity:.5;cursor:default}
.badge{display:grid;place-items:center;flex:none;width:48px;height:48px;border-radius:50%;background:var(--surface);color:var(--text);animation:pop .4s var(--ease) .05s both}
.badge svg{width:24px;height:24px;stroke-width:2.2}
.ref{color:var(--text)!important}
.ref strong{font:600 14px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.03em}
.pane{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 18px 20px;display:flex;flex-direction:column;gap:12px}
.pane h2{font-size:17px;font-weight:600}
.note{color:var(--muted);font-size:13.5px}
.ph{display:flex;align-items:center;gap:6px;margin-left:-8px}
.tickets{list-style:none;padding:0;display:flex;flex-direction:column;gap:10px}
.ticket{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);font-size:14px;animation:rise .32s var(--ease) both}
.tt{display:flex;align-items:center;justify-content:space-between;gap:8px}
.tt strong{font:600 13px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.03em}
.pill{padding:2px 9px;border-radius:999px;background:var(--bubble);color:var(--muted);font-size:11.5px;font-weight:500}
.ticket p{white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ticket .muted,.ticket .tm{color:var(--muted)}
.ticket .tm{font-size:12px;-webkit-line-clamp:2}
.empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px 0;text-align:center;color:var(--muted)}
.empty svg{width:32px;height:32px;stroke-width:1.5}
.end{align-items:center;justify-content:center;text-align:center}
.end .row,.form .badge+h2{margin-top:4px}
.link{margin-top:6px;color:var(--muted);font-size:13px;text-decoration:underline;text-underline-offset:2px}
.link:disabled{opacity:.5;cursor:default}
.sheet{position:absolute;inset:0;z-index:4;display:flex;align-items:flex-end;background:rgba(12,12,9,.32);animation:fade .2s ease}
.sheet .card{width:100%;display:flex;flex-direction:column;gap:8px;padding:20px 18px calc(18px + env(safe-area-inset-bottom));background:var(--bg);border-radius:var(--r) var(--r) 0 0;box-shadow:0 -8px 30px rgba(12,12,9,.14);animation:up .3s var(--ease)}
.sheet h2{font-size:17px;font-weight:600}
.sheet p{color:var(--muted);font-size:14px}
.sheet.out{animation:out .18s ease forwards}
.sheet.out .card{animation:down .18s ease forwards}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:480px){
.root{--ox:min(var(--cx,20px),16px);--oy:min(var(--cy,20px),16px)}
.root:not([data-float]) .panel{position:fixed;inset:0;width:auto;max-width:none;height:auto;border:0;border-radius:0;padding-bottom:env(safe-area-inset-bottom);transform:translateY(24px)}
.root[data-open]:not([data-float]) .panel{transform:none}
.root[data-open]:not([data-float]) .launcher{display:none}
textarea,input{font-size:16px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
