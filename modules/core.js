const utils = require('../libs/utils');
const clone = require('clone');

module.exports = function(DORA, config) {
  /*
   *
   *
   */
  function CoreLog(node, options) {
    var isTemplated = (options||"").indexOf("{{") != -1;
    node.on("input", async function(msg) {
      var message = options || JSON.stringify(msg);
      if (isTemplated) {
          message = utils.mustache.render(message, msg);
      }
      console.log(message);
      node.send(msg);
    });
  }
  DORA.registerType('log', CoreLog);

  /*
   *
   *
   */
  function CoreError(node, options) {
    var isTemplated = (options||"").indexOf("{{") != -1;
    node.on("input", function(msg) {
      var message = options || msg.payload;
      if (isTemplated) {
          message = utils.mustache.render(message, msg);
      }
      node.err(new Error(message));
    });
  }
  DORA.registerType('error', CoreError);

  /*
   *
   *
   */
  function CoreComment(node, options) {
    node.on("input", function(msg) {
      node.send(msg);
    });
  }
  DORA.registerType('comment', CoreComment);

  /*
   *
   *
   */
  function CoreLabel(node, options) {
    const p = options.split('/');
    const name = p[0];
    const args = p.slice(1);
    const m = name.match(/^\:(.+)/);
    node.labelName = name;
    if (m) {
      node.labelName = m[1];
    }
    node.on("input", function(msg) {
      if (typeof this.flow.labels[node.labelName] === 'undefined') {
        this.flow.labels[node.labelName] = 0;
      }
      if (typeof msg.labels[node.labelName] !== 'undefined') {
        this.flow.labels[node.labelName] = msg.labels[node.labelName];
      }
      this.flow.labels[node.labelName] ++;
      msg.labels = this.flow.labels;
      node.send(msg);
    });
  }
  DORA.registerType('label', CoreLabel);

  /*
   *
   *
   */
  function CoreIf(node, options) {
    const params = options.split('/');
    var string = params[0];
    var isTemplated = (string||"").indexOf("{{") != -1;
    if (params.length > 1) {
      node.nextLabel(params.slice(1).join('/'));
    }
    node.on("input", function(msg) {
      if (typeof msg.quiz === 'undefined') msg.quiz = {};
      const n = [];
      let message = string;
      if (isTemplated) {
          message = utils.mustache.render(message, msg);
      }
      if (msg.payload.indexOf(message) >= 0) {
        node.jump(msg);
      }　else {
        node.next(msg);
      }
    });
  }
  DORA.registerType('if', CoreIf);

  /*
   *
   *
   */
  function CoreGoto(node, options) {
    if (node.nextLabel(options) <= 0) throw new Error('ラベルを指定してください。')
    node.on("input", function(msg) {
      node.jump(msg);
    });
  }
  DORA.registerType('goto', CoreGoto);

  /*
   *
   *
   */
  function CoreGotoRandom(node, options) {
    if (node.nextLabel(options) <= 0) throw new Error('ラベルを指定してください。')
    node._counter = 0;
    node.on("input", function(msg) {
      if (node._counter === 0) {
        node._randtable = node.wires.slice(0,node.wires.length-1).map( (v, i) => {
          return i;
        });
        for (var i=0;i<node.wires.length*3;i++) {
          const a = utils.randInteger(0, node.wires.length-1);
          const b = utils.randInteger(0, node.wires.length-1);
          const c = node._randtable[a];
          node._randtable[a] = node._randtable[b];
          node._randtable[b] = c;
        }
      }
      const n = node._randtable[node._counter];
      const t = node.wires.map( v => {
        return null;
      });
      t[n] = msg;
      node._counter ++;
      if (node._counter >= node.wires.length-1) {
        node._counter = 0;
      }
      node.send(t);
    });
  }
  DORA.registerType('goto.random', CoreGotoRandom);

  /*
   *
   *
   */
  function CoreGotoSequece(node, options) {
    if (node.nextLabel(options) <= 0) throw new Error('ラベルを指定してください。')
    node._counter = 0;
    node.on("input", function(msg) {
      const t = node.wires.map( v => {
        return null;
      });
      t[node._counter] = msg;
      node._counter ++;
      if (node._counter >= node.wires.length-1) {
        node._counter = 0;
      }
      node.send(t);
    });
  }
  DORA.registerType('goto.sequece', CoreGotoSequece);

  /*
   *
   *
   */
  function CoreDelay(node, options) {
    node.on("input", async function(msg) {
      const rate = (typeof msg.defaultInterval === 'undefined') ? 1 : parseFloat(msg.defaultInterval);
      if (options === '0') {
        await utils.timeout(parseInt(1000*rate));
      } else {
        await utils.timeout(parseInt(1000*parseFloat(options)*rate));
      }
      node.send(msg);
    });
  }
  DORA.registerType('delay', CoreDelay);

  /*
   *
   *
   */
  function CoreEnd(node, options) {
    node.on("input", function(msg) {
      node.end(null, msg);
    });
  }
  DORA.registerType('end', CoreEnd);

  /*
   *
   *
   */
  function CoreFork(node, options) {
    node.nextLabel(options);
    node.on("input", function(msg) {
      var forkid = utils.generateId();
      if (!node.global()._forks) {
        node.global()._forks = {};
      }
      if (!node.global()._forks[forkid]) {
        node.global()._forks[forkid] = {}
      }
      var forks = node.global()._forks[forkid];
      var numOutputs = node.wires.length-1;
      if (!msg._forks) msg._forks = [];
      msg._forks.push(forkid);
      forks.numWire = numOutputs;
      forks.priority = 0;
      forks.name = "";
      forks.msg = {};
      node.fork(msg);
    });
  }
  DORA.registerType('fork', CoreFork);

  /*
   *
   *
   */
  function CorePush(node, options) {
    node.on("input", function(msg) {
      if (!msg.stack) msg.stack = [];
      if (options === null) {
        options = msg.payload;
      }
      msg.stack.push(options);
      node.send(msg);
    });
  }
  DORA.registerType('push', CorePush);

  /*
   *
   *
   */
  function CorePop(node, options) {
    node.on("input", function(msg) {
      if (!msg.stack) msg.stack = [];
      msg.payload = msg.stack.pop();
      node.send(msg);
    });
  }
  DORA.registerType('pop', CorePop);

  /*
   *
   *
   */
  function CoreJoin(node, options) {
    node.nextLabel(options);
    node.on("input", function(msg) {
      let freeze = false;
      if (msg._forks && msg._forks.length > 0) {
        const forkid = msg._forks[msg._forks.length-1];
        if (this.global()._forks && this.global()._forks[forkid]) {
          var forks = this.global()._forks[forkid];
          if (typeof msg.topicPriority !== 'undefined' && forks.priority < msg.topicPriority) {
            forks.priority = msg.topicPriority;
            forks.name = msg.topic;
            forks.msg = clone(msg);
            if (forks.node) {
              const n = forks.node;
              forks.node = node;
              n.end(null, msg);
            } else {
              forks.node = node;
            }
            freeze = true;
          }
          forks.numWire --;
          if (forks.numWire <= 0) {
            msg._forks.pop();
            const forkid = msg._forks[msg._forks.length-1];
            if (typeof forks.msg.topic !== 'undefined' && forks.msg.topicPriority !== 0) {
              forks.msg._forks = msg._forks;
              if (node.wires.length > 1) {
                forks.node.jump(forks.msg);
              } else {
                forks.node.next(forks.msg);
              }
              if (!freeze) {
                node.end(null, msg);
              }
            } else {
              if (msg.topicPriority === 0) {
                delete msg.topic;
              }
              if (node.wires.length > 1) {
                node.jump(msg);
              } else {
                node.next(msg);
              }
            }
            return;
          }
        } else {
          //error
        }
      }
      if (!freeze) {
        node.end(null, msg);
      }
    });
  }
  DORA.registerType('join', CoreJoin);

  /*
   *
   *
   */
  function CoreJoinLoop(node, options) {
    node.nextLabel(options);
    node.on("input", function(msg) {
      if (msg._forks && msg._forks.length > 0) {
        node.jump(msg);
      } else {
        node.next(msg);
      }
    });
  }
  DORA.registerType('joinLoop', CoreJoinLoop);

  /*
   *
   *
   */
  function CorePriority(node, options) {
    node.on("input", function(msg) {
      if (typeof msg.topicPriority === 'undefined') {
        msg.topicPriority = 0;
      }
      msg.topicPriority = msg.topicPriority + ((options === null) ? 10 : parseInt(options));
      node.send(msg);
    });
  }
  DORA.registerType('priority', CorePriority);

  /*
   *
   *
   */
  function CoreTopic(node, options) {
    node.on("input", function(msg) {
      msg.topic = options;
      msg.topicPriority = (typeof msg.topicPriority !== 'undefined') ? msg.topicPriority : 0;
      node.send(msg);
    });
  }
  DORA.registerType('topic', CoreTopic);

  /*
   *
   *
   */
  function CoreOther(node, options) {
    node.nextLabel(options);
    node.on("input", function(msg) {
      if (msg.topicPriority > 0) {
        node.next(msg);
      } else {
        node.jump(msg);
      }
    });
  }
  DORA.registerType('other', CoreOther);

  /*
   *
   *
   */
  function Sound(node, options) {
    var isTemplated = (options||"").indexOf("{{") != -1;
    node.on("input", async function(msg) {
      let message = options;
      if (isTemplated) {
        message = DORA.utils.mustache.render(message, msg);
      }
      await node.flow.request({
        type: 'sound',
        sound: message,
      });
      node.send(msg);
    });
  }
  DORA.registerType('sound', Sound);

  /*
   *
   *
   */
  function CoreSet(node, options) {
    var isTemplated = (options||"").indexOf("{{") != -1;
    const p = options.split('/');
    const field = p[0].split('.');
    if (p.length < 2) {
      throw new Error('パラメータがありません。');
    }
    node.on("input", async function(msg) {
      let t = msg;
      let key = null;
      let v = msg;
      field.forEach( f => {
        if (typeof t === 'undefined' || typeof t !== 'object') {
          v[key] = {};
          t = v[key];
        }
        key = f;
        v = t
        t = t[f];
      });
      if (typeof v !== 'undefined' && typeof key !== 'undefined') {
        const val = (v) => {
          if (utils.isNumeric(v)) {
            if (v.indexOf('.') >= 0) {
              return parseFloat(v);
            } else {
              return parseInt(v);
            }
          }
          if (isTemplated) {
            v = utils.mustache.render(v, msg);
          }
          return v;
        }
        v[key]= val(p.slice(1).join('/'));
      }
      if (msg.labels) {
        Object.keys(msg.labels).forEach( key => {
          const v = msg.labels[key];
          this.flow.labels[key] = v;
        });
      }
      node.send(msg);
    });
  }
  DORA.registerType('set', CoreSet);

  /*
   *
   *
   */
  function CoreSetString(node, options) {
    var isTemplated = (options||"").indexOf("{{") != -1;
    const p = options.split('/');
    const field = p[0].split('.');
    if (p.length < 2) {
      throw new Error('パラメータがありません。');
    }
    node.on("input", async function(msg) {
      let t = msg;
      let key = null;
      let v = msg;
      field.forEach( f => {
        if (typeof t === 'undefined' || typeof t !== 'object') {
          v[key] = {};
          t = v[key];
        }
        key = f;
        v = t
        t = t[f];
      });
      if (typeof v !== 'undefined' && typeof key !== 'undefined') {
        let message = p.slice(1).join('/');
        if (isTemplated) {
          message = utils.mustache.render(message, msg);
        }
        v[key]= message;
      }
      if (msg.labels) {
        Object.keys(msg.labels).forEach( key => {
          const v = msg.labels[key];
          this.flow.labels[key] = v;
        });
      }
      node.send(msg);
    });
  }
  DORA.registerType('setString', CoreSetString);

  /*
   *
   *
   */
  function CoreSetNumber(node, options) {
    var isTemplated = (options||"").indexOf("{{") != -1;
    const p = options.split('/');
    const field = p[0].split('.');
    if (p.length < 2) {
      throw new Error('パラメータがありません。');
    }
    node.on("input", async function(msg) {
      let t = msg;
      let key = null;
      let v = msg;
      field.forEach( f => {
        if (typeof t === 'undefined' || typeof t !== 'object') {
          v[key] = {};
          t = v[key];
        }
        key = f;
        v = t
        t = t[f];
      });
      if (typeof v !== 'undefined' && typeof key !== 'undefined') {
        const val = (v) => {
          if (utils.isNumeric(v)) {
            if (v.indexOf('.') >= 0) {
              return parseFloat(v);
            } else {
              return parseInt(v);
            }
          }
          node.err(new Error('数字ではありません。'));
        }
        let message = p.slice(1).join('/');
        if (isTemplated) {
          message = utils.mustache.render(message, msg);
        }
        v[key]= val(message);
      }
      if (msg.labels) {
        Object.keys(msg.labels).forEach( key => {
          const v = msg.labels[key];
          this.flow.labels[key] = v;
        });
      }
      node.send(msg);
    });
  }
  DORA.registerType('setNumber', CoreSetNumber);

  /*
   *
   *
   */
  function CoreGet(node, options) {
    const p = options.split('/');
    const field = p[0].split('.');
    node.on("input", async function(msg) {
      let t = msg;
      field.forEach( f => {
        if (typeof t !== 'undefined') {
          t = t[f];
        }
      });
      if (typeof t !== 'undefined') {
        msg.payload = t;
      }
      node.send(msg);
    });
  }
  DORA.registerType('get', CoreGet);

  /*
   *
   *
   */
  function CoreChange(node, options) {
    const params = options.split('/');
    if (params.length < 2) {
      throw new Error('パラメータがありません。');
    }
    var isTemplated1 = (params[0]||"").indexOf("{{") != -1;
    var isTemplated2 = (params[1]||"").indexOf("{{") != -1;
    node.on("input", async function(msg) {
      let p1 = params[0];
      let p2 = params[1];
      if (isTemplated1) {
        p1 = utils.mustache.render(p1, msg);
      }
      if (isTemplated2) {
        p2 = utils.mustache.render(p2, msg);
      }
      if (p1.indexOf('.') == 0) {
        p1 = p1.slice(1);
      }
      if (p2.indexOf('.') == 0) {
        p2 = p2.slice(1);
      }
      const getField = (msg, field) => {
        let val = msg;
        let key = null;
        field.split('.').forEach( f => {
          if (key) {
            if (typeof val[key] === 'undefined' || typeof val[key] !== 'object') {
              val[key] = {};
            }
            val = val[key];
          }
          key = f;
        });
        return { val, key };
      }
      const v1 = getField(msg, p1);
      const v2 = getField(msg, p2);
      if (v1 && v2) {
        v1.val[v1.key] = clone(v2.val[v2.key]);
      }
      node.send(msg);
    });
  }
  DORA.registerType('change', CoreChange);

  /*
   *
   *
   */
  function TextToSpeech(node, options) {
    var isTemplated = (options||"").indexOf("{{") != -1;
    node.on("input", async function(msg) {
      const { socket } = node.flow.options;
      var message = options || msg.payload;
      if (isTemplated) {
          message = utils.mustache.render(message, msg);
      }
      const params = {};
      if (typeof msg.speed !== 'undefined') {
        params.speed = msg.speed;
      }
      if (typeof msg.volume !== 'undefined') {
        params.volume = msg.volume;
      }
      if (msg.silence) {
        msg.payload = message;
        node.send(msg);
      } else {
        socket.emit('text-to-speech', { message, ...params }, (err, res) => {
          msg.payload = message;
          node.send(msg);
        });
      }
    });
  }
  DORA.registerType('text-to-speech', TextToSpeech);

  /*
   *
   *
   */
  function SpeechToText(node, options) {
    node.nextLabel(options);
    node.on("input", function(msg) {
      const { socket } = node.flow.options;
      const params = {
        timeout: 30000,
        sensitivity: 'keep',
      };
      if (typeof msg.timeout !== 'undefined') {
        params.timeout = msg.timeout;
      }
      if (typeof msg.sensitivity !== 'undefined') {
        params.sensitivity = msg.sensitivity;
      }
      node.recording = true;
      socket.emit('speech-to-text', params, (res) => {
        if (!node.recording) return;
        node.recording = false;
        if (res == '[timeout]') {
          msg.payload = 'timeout';
          node.send(msg);
        } else
        if (res == '[canceled]') {
          msg.payload = 'canceled';
          node.send(msg);
        } else
        if (res == '[camera]') {
          msg.payload = 'camera';
          node.send(msg);
        } else {
          if (res.button) {
            msg.payload = 'button';
            msg.button = res;
            delete res.button;
            node.send(msg);
          } else
          if (res.speechRequest) {
            msg.speechRequest = true;
            msg.payload = res.payload;
            msg.speechText = msg.payload;
            msg.topicPriority = 0;
            node.next(msg);
          } else {
            msg.payload = res;
            msg.speechText = msg.payload;
            msg.topicPriority = 0;
            delete msg.speechRequest;
            node.next(msg);
          }
        }
      });
    });
  }
  DORA.registerType('speech-to-text', SpeechToText);

  /*
   *
   *
   */
  function WaitEvent(node, options) {
    node.nextLabel(options);
    node.on("input", function(msg) {
      const { socket } = node.flow.options;
      const params = {
        timeout: 0,
        sensitivity: 'keep',
      };
      params.timeout = 0;
      node.recording = true;
      socket.emit('speech-to-text', params, (res) => {
        if (!node.recording) return;
        node.recording = false;
        if (res == '[timeout]') {
          msg.payload = 'timeout';
          node.send(msg);
        } else
        if (res == '[canceled]') {
          msg.payload = 'canceled';
          node.send(msg);
        } else
        if (res == '[camera]') {
          msg.payload = 'camera';
          node.send(msg);
        } else {
          if (res.button) {
            msg.payload = 'button';
            msg.button = res;
            delete res.button;
            node.send(msg);
          } else
          if (res.speechRequest) {
            msg.speechRequest = true;
            msg.payload = res.payload;
            msg.speechText = msg.payload;
            msg.topicPriority = 0;
            node.next(msg);
          } else {
            msg.payload = res;
            msg.speechText = msg.payload;
            msg.topicPriority = 0;
            delete msg.speechRequest;
            node.next(msg);
          }
        }
      });
    });
  }
  DORA.registerType('wait-event', WaitEvent);

  /*
   *
   *
   */
  function CoreChat(node, options) {
    var isTemplated = (options||"").indexOf("{{") != -1;
    node.on("input", function(msg) {
      const { socket } = node.flow.options;
      var message = options || msg.payload;
      if (isTemplated) {
          message = utils.mustache.render(message, msg);
      }
      socket.emit('docomo-chat', {
        message,
        silence: true,
      }, (res) => {
        msg.payload = res;
        node.next(msg);
      });
    });
  }
  DORA.registerType('chat', CoreChat);

  /*
   *
   *
   */
  function CoreSwitch(node, options) {
    const params = options.split('/');
    var string = params[0];
    var isTemplated = (string||"").indexOf("{{") != -1;
    if (params.length > 1) {
       node.nextLabel(params.slice(1).join('/'))
    } else {
       node.nextLabel(string)
    }
    node.on("input", function(msg) {
      if (typeof msg.quiz === 'undefined') msg.quiz = {};
      const n = [];
      let message = string;
      if (isTemplated) {
          message = utils.mustache.render(message, msg);
      }
      if (message.trim() == msg.payload.trim()) {
        node.jump(msg);
      } else {
        node.next(msg);
      }
    });
  }
  DORA.registerType('switch', CoreSwitch);

  /*
   *
   *
   */
  function CoreCheck(node, options) {
    const params = options.split('/');
    var string = params[0];
    var isTemplated = (string||"").indexOf("{{") != -1;
    var priority = 10;
    if (params.length > 1) {
      priority = parseInt(params[1]);
    }
    node.on("input", function(msg) {
      if (typeof msg.quiz === 'undefined') msg.quiz = {};
      const n = [];
      let message = string;
      if (isTemplated) {
          message = utils.mustache.render(message, msg);
      }
      if (msg.payload.indexOf(message) >= 0) {
        msg.topicPriority = (typeof msg.topicPriority !== 'undefined') ? msg.topicPriority : 0;
        msg.topicPriority += priority;
      }
      node.send(msg);
    });
  }
  DORA.registerType('check', CoreCheck);

  /*
   *
   *
   */
  function CorePayload(node, options) {
    var isTemplated = (options||"").indexOf("{{") != -1;
    node.on("input", function(msg) {
      var message = options || msg.payload;
      if (isTemplated) {
          message = utils.mustache.render(message, msg);
      }
      msg.payload = message;
      node.send(msg);
    });
  }
  DORA.registerType('payload', CorePayload);

  /*
   *
   *
   */
  function CoreCall(node, options) {
    node.options = options
    node.on("input", function(msg) {
      const opt = {}
      Object.keys(node.flow.options).forEach( key => {
        opt[key] = node.flow.options[key]; 
      })
      opt.range = {
        start: 0,
      }
      node.dora.play(msg, opt, (err, msg) => {
        node.send(msg);
      });
    });
  }
  DORA.registerType('call', CoreCall);

  /*
   *
   *
   */
  function CoreExec(node, options) {
    node.on("input", function(msg) {
      var script = options;
      //eval(script);
      node.send(msg);
    });
  }
  DORA.registerType('exec', CoreExec);

  /*
   *
   *
   */
  function CoreEval(node, options) {
    node.on("input", function(msg) {
      node.flow.engine.eval(node, msg, {}, (err, msg) => {
        node.send(msg);
      });
    })
  }
  DORA.registerType('eval', CoreEval);

  /*
   *
   *
   */
  function QuizSelect(node, options) {
    node.on("input", function(msg) {
      if (typeof msg.quiz === 'undefined') msg.quiz = {};
      msg.quiz.pages.push({
        action: 'quiz',
        question: options,
        choices: [],
        answers: [],
      });
      node.send(msg);
    });
  }
  DORA.registerType('select', QuizSelect);

  /*
   *
   *
   */
  function QuizOptionOK(node, options) {
    node.on("input", function(msg) {
      if (typeof msg.quiz === 'undefined') msg.quiz = {};
      msg.quiz.pages[msg.quiz.pages.length-1].choices.push(options);
      msg.quiz.pages[msg.quiz.pages.length-1].answers.push(options);
      node.send(msg);
    });
  }
  DORA.registerType('ok', QuizOptionOK);

  /*
   *
   *
   */
  function QuizOptionNG(node, options) {
    node.on("input", function(msg) {
      if (typeof msg.quiz === 'undefined') msg.quiz = {};
      msg.quiz.pages[msg.quiz.pages.length-1].choices.push(options);
      node.send(msg);
    });
  }
  DORA.registerType('ng', QuizOptionNG);

  /*
   *
   *
   */
  function QuizRun(node, options) {
    var isTemplated = (options||"").indexOf("{{") != -1;
    node.on("input", function(msg) {
      let nextscript = options || msg.payload;
      if (isTemplated) {
          nextscript = utils.mustache.render(nextscript, msg);
      }
      msg._nextscript = nextscript;
      node.end(null, msg);
    });
  }
  DORA.registerType('run', QuizRun);
}
