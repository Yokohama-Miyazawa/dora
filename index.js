const Flow = require('./libs/flow');
const Node = require('./libs/node');
const Core = require('./modules/core');
const Quiz = require('./modules/quiz');

const util = require("util");
const clone = require("clone");

class Dora {
  constructor(config){
    this.config = config;
    this.labels = {};
    this.global = {};
    this.types = {};
    this.nodes = [];
    this.labelNodes = {};
    this.global = {};
    this._modname = 'core';
    Core(this);
    this._modname = 'quiz';
    Quiz(this);
  }

  load(filename, loader) {
    return new Promise(res => loader(filename, res));
  }

  loadModule(name, mod, config) {
    this._modname = name;
    mod(this, config);
  }

  registerType(name, node) {
    this.types[`${this._modname}.${name}`] = node;
    if (this._modname === 'core') {
      this.types[`${name}`] = node;
    }
  }

  initNode(lines, flow) {
    const labels = {}
    this.nodes = [];
    let speech = [];
    lines.forEach( (line, index) => {
      const node = new Node(flow);
      this.exec_node = node;
      node.line = line;
      node.index = index;
      flow.push(node);
      //コメント行
      if (line.indexOf('//') === 0) {
        this.types['comment'](node)
        node.name = 'comment';
      } else
      //ラベル行
      if (line.indexOf(':') === 0) {
        const m = line.match(/^:(.+)$/);
        const l = m[1].split('/');
        labels[l[0]] = {
          node: node,
          line: index,
          option: l.slice(1).join('/'),
          value: 0,
        }
        this.types['label'](node, m[1]);
        node.name = 'label';
      } else
      //コントロール行
      if (line.indexOf('/') === 0) {
        const m = line.match(/^\/(.+)$/);
        const t = m[1].match(/(.+?)\/(.+)/);
        if (t) {
          var cmd = t[1];
          var opt = t[2];
        } else {
          var cmd = m[1];
          var opt = null;
        }
        if (cmd.match(/^[\d\.]*$/) || cmd.match(/^[\d\.]*s$/) || cmd.match(/^[\d\.]*秒$/)) {
          const t = cmd.match(/([\d\.]*)/);
          this.types['delay'](node, t[1]);
          node.name = 'delay';
        } else {
          node.options = opt;
          if (cmd.indexOf('.') === 0) {
            const t = cmd.match(/\.(.+)/);
            if (opt !== null) {
              this.types['set'](node, `${t[1]}/${opt}`);
              node.name = 'set';
            } else {
              this.types['get'](node, t[1]);
              node.name = 'get';
            }
          } else
          if (this.types[cmd]) {
            this.types[cmd](node, opt);
            node.name = cmd;
          } else {
            throw new Error('存在しないコントロールです.');
          }
        }
      //スピーチ
      } else {
        this.types['text-to-speech'](node, line);
        node.name = 'text-to-speech';
      }
      if (this.nodes.length > 0) {
        const n = this.nodes[this.nodes.length-1];
        n.next = node
      }
      this.nodes.push(node);
    })
    {
      const node = new Node(flow);
      this.types['end'](node);
      node.name = 'end';
      if (this.nodes.length > 0) {
        const n = this.nodes[this.nodes.length-1];
        n.next = node
      }
      this.nodes.push(node);
    }
    this.labels = labels;
    return flow;
  }

  async parse(script, loader) {
    if (!script) {
      throw new Error('スクリプトがありません。');
      return;
    }
    const lines = script.split('\n').map( (v,i) => {
      if (v === '' && i > 0) {
        return '/1s';
      }
      return v;
    }).join('\n').replace(/(\/\*[^*]*\*\/)|(^\/\/.*)/g, '//').trim().split('\n');
    this.labelNodes = {};
    const flow = this.initNode(lines, new Flow(this));
    this.flow = flow;
    Object.keys(this.labelNodes).forEach( key => {
      const _key = key.slice(1);
      this.labelNodes[key].forEach( node => {
        if (this.labels[_key]) {
          node.wires.push(this.labels[_key].node);
        } else {
          this.exec_node = node;
          throw new Error(`ラベル '${key}' がみつかりません。`);
        }
      });
    });
    this.nodes.forEach( node => {
      node.wires.push(node.next);
    });
    for (var i=0;i<this.nodes.length;i++) {
      const node = this.nodes[i];
      if (node.name == 'call') {
        node.dora = new Dora(this.config);
        const script = await this.load(node.options, loader);
        await node.dora.parse(script, loader);
        node.dora.flow.parentFlow = this.flow;
      }
    }
  }

  play(msg, options, callback) {
    if (this.flow) {
      this.flow.stop();
    }
    this.callback = callback;
    this.flow.options = options;
    const { range: {start, end} } = options;
    if (start) {
      this.flow.run(this.nodes[start], msg);
    } else {
      this.flow.run(this.nodes[0], msg);
    }
  }

  stop() {
    if (this.flow) {
      this.flow.stop();
    }
  }

  run(flow) {
  }

  exec(flow, node, msg) {
    if (flow.isRunning()) {
      const { range: {start, end} } = flow.options;
      let exitflag = ((typeof end !== 'undefined' && node.index >= end) || (typeof start !== 'undefined' && node.index < start));
      if (typeof start !== 'undefined' && typeof end === 'undefined') exitflag = false;
      if (exitflag) {
        if (flow.runnode == 0 || flow.isRunning() == false) {
          flow.stop();
          if (this.callback) this.callback(null, msg);
        }
      } else {
        delete msg.labels;
        const m = clone(msg);
        m.labels = {}
        Object.keys(flow.engine.labels).forEach( name => {
          m.labels[name] = flow.engine.labels[name];
        });
        node.up();
        flow.up();
        this.exec_node = node;
        flow.execNodes.push({ node, msg: m });
      }
    }
  }

  emit(flow, node, msg) {
    if (msg === null || typeof msg === "undefined") {
        return;
    } else if (!util.isArray(msg)) {
      msg = [msg];
    }
    let numOutputs = node.wires.length;
    for (var i = 0; i < numOutputs; i++) {
      if (i < msg.length) {
        const msgs = msg[i];
        if (msgs === null || typeof msgs === "undefined") {
        } else {
          const next = node.wires[i];
          this.exec(flow, next, msgs);
        }
      }
    }
    flow.exec();
  }

  send(flow, node, msg) {
    if (node) {
      node.down();
      flow.down();
      this.emit(flow, node, msg);
    }
  }

  end(flow, node, err, msg) {
    node.down();
    flow.down();
    if (flow.runnode == 0 || err || flow.isRunning() == false) {
      flow.stop();
      delete msg.labels;
      const m = clone(msg);
      if (this.callback) this.callback(err, m);
    }
  }

  nextLabel(node, label) {
    if (!util.isArray(label)) {
      label = [label];
    }
    var numLabels = label.length;
    for (var i = 0; i < numLabels; i++) {
      const _label = label[i].trim();
      if (_label.indexOf(':') === 0) {
        if (!this.labelNodes[_label]) {
          this.labelNodes[_label] = [];
        }
        this.labelNodes[_label].push(node);
      }
    }
  }

  errorInfo() {
    return {
      lineNumber: this.exec_node.index+1,
      code: this.exec_node.line,
      reason: this.exec_node.reason,
    }
  }
}

module.exports = Dora;
