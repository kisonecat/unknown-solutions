import 'xterm/dist/xterm.css';
import 'xterm/dist/addons/fullscreen/fullscreen.css';
import './styles/main.css';

import * as scrypt from 'scrypt-js';
import * as ora from 'ora';
import * as stream from 'stream';
import * as ansiEscapes from 'ansi-escapes';
import * as style from 'ansi-styles';
import 'webcrypto-liner/dist/webcrypto-liner.lib.js';
import thePuzzles from '../puzzles.json';
import banner from './banner.json';
import { Terminal } from 'xterm';
import * as fullscreen from 'xterm/lib/addons/fullscreen/fullscreen';
import * as fit from 'xterm/lib/addons/fit/fit';
import LocalEchoController from 'local-echo';
import * as base64 from 'base64-js';

window.ss = scrypt;
var N = 1024*8, r = 8, p = 1;
var dkLen = 32;

function normalizeAnswer( text ) {
  text = text.toUpperCase();
  text = text.replace(/[^0-9A-Z]/g, '' );
  return text.normalize('NFKC');
}

function generateKey( passwordText, salt, stdout ) {
  let password = Buffer.from( normalizeAnswer(passwordText) );  
  
  return new Promise(function(resolve, reject) {
    let spinner = ora({spinner: 'bouncingBar', text:'Thinking...', stream: stdout});
    spinner.start();
    
    scrypt(password, salt, N, r, p, dkLen, function(error, progress, key) {
      if (error) {
        spinner.stop();
        reject(error);
      } else if (key) {
        stdout.write("\r");
        spinner.stop();                
        resolve(key);
      }
    });  
  });
}

async function unlockPuzzle( puzzle, response, stdout ) {
  for( let k of puzzle.keys ) {
    let key = {
      iv: base64.toByteArray(k.iv),
      data: base64.toByteArray(k.data),
      salt: base64.toByteArray(k.salt)
    };

    let hashed = await generateKey( response, key.salt, stdout );
    
    let alg = {
      name: "AES-GCM",
      iv: key.iv
    };

    let aesKey = await crypto.subtle.importKey('raw', new Int8Array(hashed), alg, false, ['decrypt']);

    try {
      var envelopeKey = await crypto.subtle.decrypt(
        alg,
        aesKey,
        key.data
      );
    
      let envelope = {
        iv: base64.toByteArray(puzzle.envelope.iv),
        data: base64.toByteArray(puzzle.envelope.data)
      };

      let alg2 = {
        name: "AES-GCM",
        iv: envelope.iv
      };
      let secondKey = await crypto.subtle.importKey('raw', envelopeKey, alg2, false, ['decrypt']);
      
      var openedEnvelope = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: envelope.iv },
        secondKey,
        envelope.data
      );

      let decoder = new TextDecoder('utf8');
      
      var contents = decoder.decode(openedEnvelope);
      
      return JSON.parse( contents );
    } catch (err) {
      console.error(err);
    }
  }
  
  return puzzle;
}


document.addEventListener("DOMContentLoaded", function(event) {
  Terminal.applyAddon(fullscreen);
  Terminal.applyAddon(fit);
  
  let term = new Terminal({fontFamily: 'Ubuntu Mono, courier-new, courier, monospace'});

  var elem = document.createElement('div');
  document.body.appendChild(elem);
  term.open(elem);

  term.fit();
  term.toggleFullScreen();
  term.focus();

  banner.forEach( function(line) {
    term.write(line);
    term.write( "\r\n" );    
  });
                                               
  const localEcho = new LocalEchoController(term);

  let stdout = {
    isTTY: true,
    write: function(s) {
      //term.write
      term.write(s);
    },
    columns: term.cols,
    cursorTo: function(x) {
      term.write(ansiEscapes.cursorTo(x));
    },
    clear: function(lines) {
      console.log(lines);
    },
    clearLine: function(lines) {
      term.write(ansiEscapes.eraseEndLine);
    },
  };
  
  term.on("resize",  function() {
    stdout.columns = term.cols;
  });

  let puzzle = thePuzzles;
  console.log(puzzle);
  
  async function processCommands() {
    for(;;) {
      term.write( "\r\n" );
      let decoder = new TextDecoder('ascii');
      term.write( decoder.decode(base64.toByteArray(puzzle.text)) );
      term.write( "\r\n" );
    
      if (puzzle.keys === undefined) {
        return;
      } else {
        let response = await localEcho.read("\u203a ");
        if (response.length > 0) {
          try {
            puzzle = await unlockPuzzle( puzzle, response, stdout );
          } catch (err) {
            console.log("Generic error");
            console.error(err);
          }
        }
      }
    }
  }
  processCommands();
});
