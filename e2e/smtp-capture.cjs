// Local SMTP server that accepts any login and records every message it receives to a JSON file.
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const out = process.argv[2];
fs.writeFileSync(out, '[]');
fs.writeFileSync(`${out}.auth`, '[]');
new SMTPServer({
  secure: false, authOptional: true, disabledCommands: ['STARTTLS'], authMethods: ['PLAIN', 'LOGIN', 'XOAUTH2'],
  onAuth(auth, session, cb) {
    // Records how each login signed in (password or OAuth token), for the Microsoft test.
    const log = `${out}.auth`;
    const list = fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : [];
    list.push({ method: auth.method, user: auth.username, accessToken: auth.accessToken || null });
    fs.writeFileSync(log, JSON.stringify(list));
    cb(null, { user: auth.username });
  },
  onData(stream, session, cb) {
    simpleParser(stream).then((m) => {
      const list = JSON.parse(fs.readFileSync(out, 'utf8'));
      list.push({ to: m.to?.text, cc: m.cc?.text, from: m.from?.text, subject: m.subject, text: m.text, messageId: m.messageId, inReplyTo: m.inReplyTo || null, html: m.html || null });
      fs.writeFileSync(out, JSON.stringify(list, null, 2));
      cb();
    }).catch(cb);
  },
}).listen(2525, () => console.log('smtp capture on 2525'));
