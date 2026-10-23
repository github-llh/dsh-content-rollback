export const css = `
.dcr{--dcr-radius:10px;--dcr-quote-bg:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.55;min-width:0;width:100%;box-sizing:border-box}
.dcr *{box-sizing:border-box}.dcr button,.dcr textarea{font:inherit;color:inherit}
.dcr button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;padding:5px 10px;cursor:pointer;min-height:30px;transition:background .15s ease,border-color .15s ease,opacity .15s ease}
.dcr button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dcr button:disabled{opacity:.45;cursor:default}
.dcr button.dcr-primary{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);font-weight:600}
.dcr button.dcr-primary:hover:not(:disabled){background:var(--dsw-alias-label-primary);opacity:.88}
.dcr button:focus-visible,.dcr textarea:focus-visible,.dcr input:focus-visible{outline:2px solid var(--dsw-focus-ring-color);outline-offset:2px}
.dcr-bar{display:flex;align-items:center;gap:8px;padding:4px 2px}.dcr-bar>button:first-child{border-color:transparent;padding-left:4px;padding-right:6px}
.dcr-bar-actions{display:flex;align-items:center;gap:6px;margin-left:auto;min-width:0}
.dcr-muted{color:var(--dsw-alias-label-secondary)}.dcr-tagline{color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}
.dcr-quote-trigger{border-style:dashed!important;color:var(--dsw-alias-label-secondary);white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
.dcr-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-elevation-panel,0 1px 2px rgba(0,0,0,.04));margin:4px 0 9px;overflow:hidden;animation:dcr-in .16s ease}
@keyframes dcr-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.dcr-head,.dcr-foot{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:11px 14px;flex-wrap:wrap}.dcr-head{border-bottom:1px solid var(--dsw-alias-border-l1)}
.dcr-head h3{font-size:12px;margin:0;font-weight:600;letter-spacing:.01em}
.dcr-head .dcr-actions button{border-color:transparent;min-height:26px;padding:3px 7px;color:var(--dsw-alias-label-secondary)}
.dcr-scroll{max-height:min(48vh,420px);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
.dcr-list{list-style:none;margin:0;padding:5px}.dcr-list li{margin:2px 0}
.dcr-list button{display:block;width:100%;text-align:left;border-color:transparent;padding:9px 10px;border-radius:8px}
.dcr-list button:hover:not(:disabled){border-color:var(--dsw-alias-border-l1)}
.dcr-preview{white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dcr-meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:11px;margin-top:4px}
.dcr-body{padding:12px 14px}.dcr-note{color:var(--dsw-alias-label-secondary);margin:0 0 9px;font-size:11px;overflow-wrap:anywhere}
.dcr-error{color:var(--dsw-alias-state-error-primary);padding:9px 14px;overflow-wrap:anywhere;font-size:11px}
.dcr-warning{border-left:2px solid var(--dsw-alias-border-l1);padding-left:10px}
.dcr-block{display:block;margin:9px 0}.dcr-block-label{display:block;font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:4px}
.dcr textarea{display:block;width:100%;min-height:76px;max-height:240px;resize:vertical;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);padding:9px 10px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}
.dcr textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
.dcr-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:5px 9px;margin:3px 4px 3px 0;max-width:100%;overflow-wrap:anywhere}.dcr-chip span{min-width:0}
.dcr-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.dcr-foot{border-top:1px solid var(--dsw-alias-border-l1)}
.dcr-check{display:flex;align-items:flex-start;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary);margin:11px 0 0}
.dcr-check input{margin-top:3px;accent-color:var(--dsw-alias-label-primary)}
.dcr-empty{text-align:center;padding:26px 14px;color:var(--dsw-alias-label-secondary)}
.dcr-status{padding:12px 14px;overflow-wrap:anywhere}.dcr-status p{margin:0 0 8px}
.dcr-notice{margin:10px 14px 0;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:11px;animation:dcr-in .16s ease}
.dcr-quote-prompt{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px}
.dcr-reply{border-bottom:1px solid var(--dsw-alias-border-l1);padding:12px 14px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 2.5%,transparent)}
.dcr-quote{border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-label-tertiary);border-radius:8px;background:var(--dcr-quote-bg);margin-bottom:9px;overflow:hidden}
.dcr-quote-head{display:flex;align-items:center;gap:6px;padding:6px 9px;color:var(--dsw-alias-label-secondary);font-size:11px}
.dcr-quote-head span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcr-quote-head button{border:0;min-height:22px;padding:0 4px;color:var(--dsw-alias-label-tertiary)}
.dcr-quote-body{margin:0;padding:0 10px 9px;max-height:118px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.6;overscroll-behavior:contain}
.dcr-reply-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;flex-wrap:wrap}
.dcr-hint{color:var(--dsw-alias-label-tertiary);font-size:10.5px;font-variant-numeric:tabular-nums}
@media(max-width:520px){.dcr-tagline{display:none}.dcr-head,.dcr-foot,.dcr-body,.dcr-reply{padding:10px}.dcr-foot .dcr-actions{width:100%}.dcr-foot button{flex:1}.dcr-scroll{max-height:42vh}.dcr-quote-trigger{max-width:52%}}
@media(prefers-reduced-motion:reduce){.dcr *{animation:none!important;transition:none!important;scroll-behavior:auto}}
`;
