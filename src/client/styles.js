export const css = `
.dcr-tools{display:inline-flex;align-items:center;gap:2px;height:28px;flex:none}
.dcr-tool{width:28px;height:28px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-grid;place-items:center;cursor:pointer;transition:background .12s ease,color .12s ease}
.dcr-tool:hover,.dcr-tool[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dcr-tool:focus-visible,.dcr-icon-btn:focus-visible,.dcr-btn:focus-visible,.dcr-row:focus-visible,.dcr-native-action:focus-visible,.dcr-quick:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dcr-tool svg{width:17px;height:17px}

.dcr-msg{display:flex;flex-direction:column;align-items:flex-end;gap:1px;width:100%;min-width:0;color:var(--dsw-alias-label-primary);font:inherit}
.dcr-fallback{display:flex;flex-direction:column;align-items:flex-end;gap:6px;max-width:min(calc(var(--dsh-chat-content-width,748px) * .702),82%)}
.dcr-fallback-bubble{padding:10px 16px;border-radius:var(--dsw-radius-xl,18px);background:var(--dsw-specific-bubble);font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%}
.dcr-msg-actions{height:26px;display:flex;align-items:center;gap:1px;padding-right:1px;opacity:0;transition:opacity .12s ease}
.dcr-msg:hover .dcr-msg-actions,.dcr-msg:focus-within .dcr-msg-actions,.dcr-msg[data-busy=true] .dcr-msg-actions{opacity:1}
.dcr-msg-time{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:5px}
.dcr-icon-btn{width:26px;height:26px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s ease,color .12s ease}
.dcr-icon-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dcr-icon-btn:disabled{opacity:.4;cursor:default}
.dcr-icon-btn svg{width:15px;height:15px}
.dcr-inline-error{margin:1px 0 0;max-width:100%;font-size:11.5px;line-height:16px;color:var(--dsw-alias-state-error-primary);text-align:right;overflow-wrap:anywhere}
.dcr-msg-note{display:flex;align-items:center;gap:5px;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);text-align:right}
.dcr-msg-body{min-width:0;max-width:100%;display:flex;flex-direction:column;align-items:flex-end}
.dcr-msg-retracted{opacity:.55}
.dcr-msg-retracted .dcr-fallback-bubble{text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--dsw-alias-label-tertiary) 60%,transparent);text-decoration-thickness:1px}
.dcr-msg-retracted-note{color:var(--dsw-alias-label-secondary)}
.dcr-quote-card{display:flex;align-items:flex-start;gap:6px;max-width:min(calc(var(--dsh-chat-content-width,748px) * .702),82%);margin-bottom:2px;padding:5px 10px;border-left:2px solid color-mix(in srgb,var(--dsw-alias-label-tertiary) 55%,transparent);border-radius:0 var(--dsw-radius-sm,6px) var(--dsw-radius-sm,6px) 0;background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dcr-quote-card svg{flex:none;margin-top:2px;opacity:.8}
.dcr-quote-card span{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dcr-selection{position:fixed;z-index:900;transform:translate(-50%,0);animation:dcr-in .1s ease}
.dcr-selection-btn{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap}
.dcr-selection-btn:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.dcr-selection-btn svg{opacity:.8}
.dcr-msg-warning{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.dcr-msg-warning .dcr-link{color:var(--dsw-alias-label-primary)}

.dcr-editor{box-sizing:border-box;width:min(560px,100%);max-width:100%;display:flex;flex-direction:column;gap:7px;padding:10px 12px 8px;border-radius:var(--dsw-radius-xl,18px);background:var(--dsw-specific-bubble);border:1px solid transparent;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));transition:border-color .12s ease}
.dcr-editor:focus-within{border-color:var(--dsw-alias-border-l3)}
.dcr-editor textarea{display:block;width:100%;min-height:44px;max-height:240px;resize:none;border:0;outline:none;background:transparent;color:inherit;font:inherit;line-height:inherit;padding:0;white-space:pre-wrap;overflow-wrap:anywhere}
.dcr-editor textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
.dcr-editor-block{display:flex;flex-direction:column;gap:3px}
.dcr-editor-label{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary)}
.dcr-editor-note{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
.dcr-editor .dcr-inline-error{text-align:left}
.dcr-editor-warning{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary))!important}
.dcr-editor-panel{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);width:100%}
.dcr-editor-chips{display:flex;flex-wrap:wrap;gap:5px}
.dcr-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:4px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dcr-chip span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcr-chip em{font-style:normal;color:var(--dsw-alias-label-tertiary);font-size:10.5px}
.dcr-editor-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.dcr-editor-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dcr-editor-actions{display:flex;align-items:center;gap:4px;margin-left:auto}
.dcr-btn{height:28px;padding:0 12px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;transition:background .12s ease,color .12s ease,opacity .12s ease}
.dcr-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dcr-btn:disabled{opacity:.4;cursor:default}
.dcr-btn-primary{background:var(--dsw-alias-button-info-fill);color:#fff}
.dcr-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-info-hover);color:#fff}
.dcr-btn-ghost{color:var(--dsw-alias-label-secondary)}
.dcr-link{border:0;background:none;padding:0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.dcr-link:hover{color:var(--dsw-alias-label-primary)}
.dcr-spinner{width:13px;height:13px;border:1.5px solid currentColor;border-right-color:transparent;border-radius:50%;display:inline-block;animation:dcr-spin .7s linear infinite;opacity:.7;flex:none}
@keyframes dcr-spin{to{transform:rotate(360deg)}}

.dcr-native-action{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));padding:6px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s ease,color .12s ease}
.dcr-native-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dcr-native-action:disabled{opacity:.45;cursor:default}
.dcr-native-action svg{width:calc(17px + var(--dsh-content-font-delta,0px));height:calc(17px + var(--dsh-content-font-delta,0px))}

.dcr-pop{position:absolute;right:0;bottom:calc(100% + 8px);z-index:100;box-sizing:border-box;width:min(540px,100%);max-height:min(62vh,520px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,14px);animation:dcr-in .12s ease}
@keyframes dcr-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.dcr-pop-head{display:flex;align-items:center;gap:4px;min-height:40px;padding:0 6px 0 10px;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1) 65%,transparent);flex:none}
.dcr-pop-title{flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dcr-pop-head .dcr-icon-btn{color:var(--dsw-alias-label-tertiary)}
.dcr-pop-body{padding:8px 10px 10px;overflow:auto;overscroll-behavior:contain;min-height:0;flex:1 1 auto}
.dcr-pop-scroll{flex:1 1 auto;overflow:auto;overscroll-behavior:contain;min-height:0;padding:3px 6px 6px}
.dcr-list{list-style:none;margin:0;padding:0}
.dcr-list li{margin:0}
.dcr-pop-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 12px;border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l1) 65%,transparent);flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dcr-pop-empty{display:flex;flex-direction:column;align-items:center;gap:5px;padding:28px 16px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.dcr-pop-empty svg{opacity:.7}
.dcr-pop-empty strong{font-size:13px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.dcr-pop-empty span{font-size:11.5px;line-height:17px;max-width:280px}
.dcr-pop-error{margin:0;padding:6px 10px;font-size:11.5px;line-height:16px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
.dcr-skeleton{display:flex;flex-direction:column;gap:7px;padding:8px 4px}
.dcr-skeleton span{display:block;height:34px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);animation:dcr-pulse 1.4s ease-in-out infinite}
.dcr-skeleton span:nth-child(2){width:88%;animation-delay:.12s}.dcr-skeleton span:nth-child(3){width:74%;animation-delay:.24s}
@keyframes dcr-pulse{0%,100%{opacity:.55}50%{opacity:1}}

.dcr-row{display:flex;align-items:center;gap:8px;width:100%;margin:1px 0;padding:7px 8px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;cursor:pointer;transition:background .12s ease}
.dcr-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dcr-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.dcr-row-text{font-size:13px;line-height:19px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;white-space:pre-wrap}
.dcr-row-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dcr-row-meta i{font-style:normal;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis}
.dcr-row-warn{border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 6px;font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dcr-row-chevron{flex:none;color:var(--dsw-alias-label-quaternary);opacity:0;transition:opacity .12s ease}
.dcr-row:hover .dcr-row-chevron,.dcr-row:focus-visible .dcr-row-chevron{opacity:1}
.dcr-quick{display:flex;align-items:center;gap:8px;width:calc(100% - 12px);margin:2px 6px 4px;padding:7px 8px;border:0;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 3%,transparent);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer;transition:background .12s ease,color .12s ease}
.dcr-quick:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dcr-quick:disabled{opacity:.5;cursor:default}
.dcr-quick svg{flex:none}
.dcr-quick span{flex:1;min-width:0}
.dcr-quick small{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;max-width:40%;overflow:hidden;text-overflow:ellipsis}
.dcr-banner{display:flex;align-items:center;gap:8px;margin:4px 6px 2px;padding:7px 9px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.dcr-banner span{flex:1;min-width:0}
.dcr-banner .dcr-btn{height:24px;padding:0 9px;font-size:11.5px;flex:none}

.dcr-quote{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 3%,transparent);padding:7px 9px;margin-bottom:8px}
.dcr-quote-head{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-bottom:3px}
.dcr-quote-body{margin:0;max-height:110px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overscroll-behavior:contain}
.dcr-model{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}

.dcr-toasts{position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:1000;display:flex;flex-direction:column;align-items:center;gap:6px;max-width:min(92vw,540px);pointer-events:none}
.dcr-toast{pointer-events:auto;display:flex;align-items:center;gap:8px;max-width:100%;padding:7px 9px 7px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);animation:dcr-in .12s ease}
.dcr-toast span{min-width:0;overflow-wrap:anywhere}
.dcr-toast-error{color:var(--dsw-alias-state-error-primary)}
.dcr-toast button{width:22px;height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:inherit;opacity:.6;cursor:pointer;flex:none;display:inline-grid;place-items:center}
.dcr-toast button:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover)}

@media(max-width:560px){
  .dcr-pop{left:0;width:100%;max-height:min(70vh,560px)}
  .dcr-editor{width:100%}
  .dcr-msg-actions{opacity:1}
  .dcr-toasts{bottom:76px}
}
@media(prefers-reduced-motion:reduce){.dcr-spinner{animation:none}.dcr-pop,.dcr-toast{animation:none}.dcr-msg-actions,.dcr-tool,.dcr-icon-btn,.dcr-btn,.dcr-row,.dcr-quick{transition:none}}
`;
