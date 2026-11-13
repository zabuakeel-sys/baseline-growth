// The HTML version of an outreach email: the same words as the plain-text version, with a small
// logo in the signature. Kept simple on purpose: heavy HTML and big images look like marketing
// mail and hurt inbox placement. Plain JS so tests can load it directly.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** True for a logo link we are willing to put in an email: https and an image-like path or host. */
export function safeLogoUrl(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

/** Plain text -> minimal HTML paragraphs, with the logo placed after the signature block. */
export function toHtml(text, { logoUrl = '', clientName = '' } = {}) {
  const blocks = String(text).split(/\n{2,}/);
  const logo = safeLogoUrl(logoUrl);
  // The signature is the block that starts with the sender's name and "On behalf of".
  const sigIndex = blocks.findIndex((b) => /On behalf of /.test(b));
  const parts = blocks.map((b, i) => {
    const html = `<p style="margin:0 0 14px">${esc(b).replace(/\n/g, '<br>')}</p>`;
    if (i === sigIndex && logo) {
      return `${html}<p style="margin:0 0 14px"><img src="${esc(logo)}" alt="${esc(clientName)}" height="36" style="height:36px;width:auto;border:0"></p>`;
    }
    return html;
  });
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${parts.join('')}</div>`;
}
