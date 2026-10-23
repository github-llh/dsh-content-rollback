export const css = `
.dcr{color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.55;min-width:0;width:100%;box-sizing:border-box}
.dcr *{box-sizing:border-box}.dcr button,.dcr textarea{font:inherit;color:inherit}
.dcr button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:transparent;padding:5px 9px;cursor:pointer;min-height:30px}
.dcr button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dcr button:disabled{opacity:.45;cursor:default}
.dcr button:focus-visible,.dcr textarea:focus-visible,.dcr input:focus-visible{outline:2px solid var(--dsw-focus-ring-color);outline-offset:2px}
.dcr-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 2px}.dcr-bar button{border:0}.dcr-muted{color:var(--dsw-alias-label-secondary)}.dcr-tagline{color:var(--dsw-alias-label-tertiary);font-size:11px}
.dcr-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);margin:3px 0 8px;overflow:hidden}
.dcr-head,.dcr-foot{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px 12px;flex-wrap:wrap}.dcr-head{border-bottom:1px solid var(--dsw-alias-border-l1)}.dcr-head h3{font-size:12px;margin:0;font-weight:600}
.dcr-scroll{max-height:min(48vh,420px);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.dcr-list{list-style:none;margin:0;padding:4px}.dcr-list li{margin:3px 0}.dcr-list button{display:block;width:100%;text-align:left;border-color:transparent;padding:8px 9px}
.dcr-preview{white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.dcr-meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:11px;margin-top:4px}
.dcr-body{padding:10px 12px}.dcr-note{color:var(--dsw-alias-label-secondary);margin:0 0 9px;font-size:11px;overflow-wrap:anywhere}.dcr-error{color:var(--dsw-alias-state-error-primary);padding:8px 12px;overflow-wrap:anywhere}.dcr-warning{border-left:2px solid var(--dsw-alias-border-l1);padding-left:9px}
.dcr-block{display:block;margin:8px 0}.dcr-block-label{display:block;font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:3px}.dcr textarea{display:block;width:100%;min-height:74px;max-height:240px;resize:vertical;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);padding:8px;white-space:pre-wrap;overflow-wrap:anywhere}
.dcr-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:5px 8px;margin:3px 4px 3px 0;max-width:100%;overflow-wrap:anywhere}.dcr-chip span{min-width:0}
.dcr-actions{display:flex;gap:7px;flex-wrap:wrap}.dcr-primary{font-weight:600}.dcr-foot{border-top:1px solid var(--dsw-alias-border-l1)}.dcr-check{display:flex;align-items:flex-start;gap:7px;font-size:11px;color:var(--dsw-alias-label-secondary);margin:10px 0}.dcr-check input{margin-top:3px;accent-color:var(--dsw-alias-label-primary)}.dcr-empty{text-align:center;padding:24px 12px;color:var(--dsw-alias-label-secondary)}.dcr-status{padding:12px;overflow-wrap:anywhere}.dcr-status p{margin:0 0 8px}
@media(max-width:480px){.dcr-tagline{display:none}.dcr-head,.dcr-foot,.dcr-body{padding:9px}.dcr-foot .dcr-actions{width:100%}.dcr-foot button{flex:1}.dcr-scroll{max-height:42vh}}
@media(prefers-reduced-motion:reduce){.dcr *{scroll-behavior:auto}}
`;
