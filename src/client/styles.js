export const css = `
.dcr{--dcr-radius:10px;--dcr-soft:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);--dcr-softer:color-mix(in srgb,var(--dsw-alias-label-primary) 2.5%,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.55;min-width:0;width:100%;box-sizing:border-box}
.dcr *{box-sizing:border-box}.dcr button,.dcr textarea{font:inherit;color:inherit}
.dcr button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;padding:5px 10px;cursor:pointer;min-height:30px;transition:background .15s ease,border-color .15s ease,opacity .15s ease}
.dcr button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dcr button:disabled{opacity:.45;cursor:default}
.dcr button.dcr-primary{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);font-weight:600}
.dcr button.dcr-primary:hover:not(:disabled){background:var(--dsw-alias-label-primary);opacity:.9}
.dcr button.dcr-ghost{border-color:transparent;color:var(--dsw-alias-label-secondary);padding-left:7px;padding-right:7px}
.dcr button.dcr-ghost:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.dcr button.dcr-link{border:0;background:none;padding:0;min-height:0;color:var(--dsw-alias-label-secondary);font-size:11px}
.dcr button.dcr-link:hover:not(:disabled){background:none;color:var(--dsw-alias-label-primary);text-decoration:underline}
.dcr button.dcr-iconbtn{width:28px;height:28px;min-height:28px;padding:0;border-color:transparent;color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1}
.dcr button:focus-visible,.dcr textarea:focus-visible,.dcr input:focus-visible{outline:2px solid var(--dsw-focus-ring-color);outline-offset:2px}
.dcr-bar{display:flex;align-items:center;gap:8px;padding:4px 2px}.dcr-bar>button:first-child{border-color:transparent;padding-left:4px;padding-right:6px}
.dcr-bar-actions{display:flex;align-items:center;gap:6px;margin-left:auto;min-width:0}
.dcr-muted{color:var(--dsw-alias-label-secondary)}.dcr-tagline{color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}
.dcr-quote-trigger{border-style:dashed!important;color:var(--dsw-alias-label-secondary);white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
.dcr-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-elevation-panel,0 1px 2px rgba(0,0,0,.04));margin:4px 0 9px;overflow:hidden;animation:dcr-in .16s ease}
@keyframes dcr-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.dcr-head{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}
.dcr-head-main{display:flex;align-items:center;gap:6px;min-width:0}.dcr-head h3{font-size:12px;margin:0;font-weight:600;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dcr-head .dcr-actions{gap:4px}
.dcr-scroll{max-height:min(52vh,460px);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
.dcr-list{list-style:none;margin:0;padding:5px}.dcr-list li{margin:2px 0}
.dcr-list button{position:relative;display:block;width:100%;text-align:left;border-color:transparent;padding:9px 30px 9px 10px;border-radius:8px}
.dcr-list button:hover:not(:disabled){border-color:var(--dsw-alias-border-l1)}
.dcr-list-chevron{position:absolute;right:9px;top:50%;transform:translateY(-50%);color:var(--dsw-alias-label-tertiary);opacity:0;transition:opacity .15s ease}
.dcr-list button:hover .dcr-list-chevron,.dcr-list button:focus-visible .dcr-list-chevron{opacity:1}
.dcr-preview{white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dcr-meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:11px;margin-top:4px}
.dcr-body{padding:12px 14px}.dcr-note{color:var(--dsw-alias-label-secondary);margin:0 0 9px;font-size:11px;overflow-wrap:anywhere}
.dcr-error{color:var(--dsw-alias-state-error-primary);padding:9px 14px;overflow-wrap:anywhere;font-size:11px}.dcr-error .dcr-link{margin-left:8px}
.dcr-warning{border-left:2px solid var(--dsw-alias-border-l1);padding-left:10px}
.dcr-message{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dcr-softer);padding:11px 12px}
.dcr-message-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.dcr-avatar{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--dcr-soft);color:var(--dsw-alias-label-secondary);font-size:11px;flex:none}
.dcr-message-meta{display:flex;flex-direction:column;line-height:1.25;min-width:0}.dcr-message-meta strong{font-size:11.5px;font-weight:600}.dcr-message-meta span{color:var(--dsw-alias-label-tertiary);font-size:10.5px}
.dcr-warn-chip{margin-left:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:2px 8px;color:var(--dsw-alias-label-secondary);font-size:10.5px;white-space:nowrap}
.dcr-message-body{display:flex;flex-direction:column;gap:8px}
.dcr-message-text{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;font-size:12.5px}
.dcr-textblock{display:flex;flex-direction:column;gap:3px}
.dcr-textlabel{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
.dcr textarea{display:block;width:100%;min-height:44px;max-height:240px;resize:none;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base);padding:8px 10px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65}
.dcr textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
.dcr-edit-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:9px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:10.5px}
.dcr-edit-tools [role="status"]{margin-right:auto}
.dcr-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:5px 9px;max-width:100%;overflow-wrap:anywhere}.dcr-chip span{min-width:0}
.dcr-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.dcr-foot{border-top:1px solid var(--dsw-alias-border-l1);display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 14px;flex-wrap:wrap}
.dcr-footmeta{display:flex;flex-direction:column;gap:2px;min-width:0}.dcr-model{color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.dcr-hint{color:var(--dsw-alias-label-tertiary);font-size:10.5px;font-variant-numeric:tabular-nums}
.dcr-details{margin:11px 0 0;border-top:1px solid var(--dsw-alias-border-l1);padding-top:9px}
.dcr-details summary{display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:11px;list-style:none;user-select:none}
.dcr-details summary::-webkit-details-marker{display:none}.dcr-details summary svg{transition:transform .15s ease}
.dcr-details[open] summary svg{transform:rotate(90deg)}
.dcr-details .dcr-note{margin-top:8px;margin-bottom:0}.dcr-details .dcr-note+.dcr-note{margin-top:6px}
.dcr-check{display:flex;align-items:flex-start;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary);margin:11px 0 0}
.dcr-check input{margin-top:3px;accent-color:var(--dsw-alias-label-primary)}.dcr-check span{display:flex;flex-direction:column;gap:1px}.dcr-check small{color:var(--dsw-alias-label-tertiary);font-size:10.5px}
.dcr-status{padding:12px 14px}.dcr-status-card{display:flex;flex-direction:column;gap:9px;background:var(--dcr-softer);border-top:1px solid var(--dsw-alias-border-l1)}
.dcr-status-line{display:flex;gap:8px;align-items:flex-start}.dcr-status-line strong{font-size:11.5px}.dcr-status-line p{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px}
.dcr-ok{color:var(--dsw-alias-label-primary);display:inline-flex}.dcr-pending-icon{color:var(--dsw-alias-label-secondary);display:inline-flex}
.dcr-empty{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:28px 16px;color:var(--dsw-alias-label-secondary)}
.dcr-empty svg{color:var(--dsw-alias-label-tertiary)}.dcr-empty strong{font-size:12px;color:var(--dsw-alias-label-primary)}.dcr-empty span{font-size:11px;max-width:300px}
.dcr-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dcr-softer);font-size:11px}
.dcr-banner div{display:flex;gap:7px;align-items:baseline;min-width:0}.dcr-banner strong{font-weight:600}
.dcr-skeleton{display:flex;flex-direction:column;gap:9px;padding:14px}.dcr-skeleton span{display:block;height:34px;border-radius:8px;background:var(--dcr-soft);animation:dcr-pulse 1.4s ease-in-out infinite}
.dcr-skeleton span:nth-child(2){width:86%;animation-delay:.15s}.dcr-skeleton span:nth-child(3){width:72%;animation-delay:.3s}
@keyframes dcr-pulse{0%,100%{opacity:.55}50%{opacity:1}}
.dcr-notice{margin:10px 14px 0;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:11px;display:flex;align-items:center;gap:6px;animation:dcr-in .16s ease}
.dcr-quote-prompt{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px}
.dcr-reply{border-bottom:1px solid var(--dsw-alias-border-l1);padding:12px 14px;background:var(--dcr-softer)}
.dcr-quote{border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-label-tertiary);border-radius:8px;background:var(--dcr-soft);margin-bottom:9px;overflow:hidden}
.dcr-quote-head{display:flex;align-items:center;gap:6px;padding:6px 9px;color:var(--dsw-alias-label-secondary);font-size:11px}
.dcr-quote-head span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcr-quote-head button{border:0;min-height:22px;padding:0 4px;color:var(--dsw-alias-label-tertiary)}
.dcr-quote-body{margin:0;padding:0 10px 9px;max-height:118px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.6;overscroll-behavior:contain}
.dcr-reply-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;flex-wrap:wrap}
@media(max-width:520px){.dcr-tagline{display:none}.dcr-head,.dcr-foot,.dcr-body,.dcr-reply{padding:10px}.dcr-foot .dcr-actions{width:100%}.dcr-foot .dcr-actions button{flex:1}.dcr-scroll{max-height:46vh}.dcr-quote-trigger{max-width:52%}.dcr-message-meta span{white-space:normal}.dcr-model{max-width:180px}}
@media(prefers-reduced-motion:reduce){.dcr *{animation:none!important;transition:none!important;scroll-behavior:auto}}
`;
