var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("Atomic error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("Atomic error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("Atomic contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of Atomic: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to Atomic.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: Atomic not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": false,
        "inputs": [
          {
            "name": "hold_id",
            "type": "bytes32"
          }
        ],
        "name": "removeHoldByCompany",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "hold_id",
            "type": "bytes32"
          }
        ],
        "name": "getHoldStatus",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "hold_ids",
            "type": "bytes32[]"
          }
        ],
        "name": "complete",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "bytes32"
          }
        ],
        "name": "holds",
        "outputs": [
          {
            "name": "user",
            "type": "address"
          },
          {
            "name": "company",
            "type": "address"
          },
          {
            "name": "price",
            "type": "uint256"
          },
          {
            "name": "expiry",
            "type": "uint256"
          },
          {
            "name": "external_id",
            "type": "bytes32"
          },
          {
            "name": "status",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "hold_ids",
            "type": "bytes32[]"
          }
        ],
        "name": "balancePayable",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "address"
          },
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "user_holds",
        "outputs": [
          {
            "name": "",
            "type": "bytes32"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "hold_id",
            "type": "bytes32"
          }
        ],
        "name": "removeHoldByUser",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "company",
            "type": "address"
          },
          {
            "name": "price",
            "type": "uint256"
          },
          {
            "name": "expiry",
            "type": "uint256"
          },
          {
            "name": "external_id",
            "type": "bytes32"
          }
        ],
        "name": "createHold",
        "outputs": [
          {
            "name": "created_hold_id",
            "type": "bytes32"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "user",
            "type": "address"
          },
          {
            "name": "company",
            "type": "address"
          },
          {
            "name": "price",
            "type": "uint256"
          },
          {
            "name": "expiry",
            "type": "uint256"
          },
          {
            "name": "external_id",
            "type": "bytes32"
          }
        ],
        "name": "holdIDForParameters",
        "outputs": [
          {
            "name": "hold_id",
            "type": "bytes32"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "address"
          },
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "company_holds",
        "outputs": [
          {
            "name": "",
            "type": "bytes32"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "hold_ids",
            "type": "bytes32[]"
          }
        ],
        "name": "isValid",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "hold_id",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "user",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "company",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "price",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "expiry",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "external_id",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "status",
            "type": "uint256"
          }
        ],
        "name": "LogHoldChange",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405234610000575b610a5d806100196000396000f300606060405236156100935763ffffffff60e060020a6000350416630d62cd3b81146100985780631ff7f2a8146100bc57806344fabe8a146100de5780637175a3c21461013d57806377aba7c41461018c57806386da32c5146101ee578063a6ae557d1461021c578063c92e7d0f14610240578063d607ffe214610274578063f0fd6e62146102ae578063f56f516f146102dc575b610000565b34610000576100a8600435610340565b604080519115158252519081900360200190f35b34610000576100cc60043561040b565b60408051918252519081900360200190f35b6100a860048080359060200190820180359060200190808060200260200160405190810160405280939291908181526020018383602002808284375094965061042395505050505050565b604080519115158252519081900360200190f35b346100005761014d60043561055a565b60408051600160a060020a039788168152959096166020860152848601939093526060840191909152608083015260a082015290519081900360c00190f35b34610000576100cc60048080359060200190820180359060200190808060200260200160405190810160405280939291908181526020018383602002808284375094965061059e95505050505050565b60408051918252519081900360200190f35b34610000576100cc600160a060020a036004351660243561062f565b60408051918252519081900360200190f35b34610000576100a860043561065e565b604080519115158252519081900360200190f35b34610000576100cc600160a060020a0360043516602435604435606435610726565b60408051918252519081900360200190f35b34610000576100cc600160a060020a036004358116906024351660443560643560843561090a565b60408051918252519081900360200190f35b34610000576100cc600160a060020a036004351660243561095d565b60408051918252519081900360200190f35b34610000576100a860048080359060200190820180359060200190808060200260200160405190810160405280939291908181526020018383602002808284375094965061098c95505050505050565b604080519115158252519081900360200190f35b60008181526002602052604081206001015433600160a060020a0390811691161461036a57610000565b600082815260026020819052604090912060050154141561038d57506000610406565b6000828152600260208181526040808420600581018590556001810154815494820154600383015460049093015484519182529481019290925281830193909352606081019490945251600160a060020a039182169392909116918591600080516020610a128339815191529181900360800190a45060015b919050565b6000818152600260205260409020600501545b919050565b600080805b835182101561055257838281518110156100005760209081029091018101516000818152600290925260409091206005015490915060011461046957610000565b6000818152600260205260409020600301544290101561048857610000565b60008181526002602081905260408083206005810183905560018101549201549051600160a060020a039092169281156108fc029290818181858888f1935050505015156104d557610000565b600081815260026020818152604092839020600181015481548285015460038401546004909401548751918252948101939093528286019390935260608201939093529251600160a060020a039283169391909216918491600080516020610a12833981519152919081900360800190a45b600190910190610428565b5b5050919050565b6002602081905260009182526040909120805460018201549282015460038301546004840154600590940154600160a060020a039384169590931693919290919086565b60008080805b845183101561062357848381518110156100005760209081029091018101516000818152600290925260409091206005015490915060011480156105f957506000818152600260205260409020600301544290115b15610617576000818152600260208190526040909120015491909101905b5b6001909201916105a4565b8193505b505050919050565b600060205281600052604060002081815481101561000057906000526020600020900160005b91509150505481565b60008181526002602052604081205433600160a060020a0390811691161461036a57610000565b600082815260026020819052604090912060050154141561038d57506000610406565b6000828152600260208181526040808420600581018590556001810154815494820154600383015460049093015484519182529481019290925281830193909352606081019490945251600160a060020a039182169392909116918591600080516020610a128339815191529181900360800190a45060015b919050565b60006000610737338787878761090a565b6040805160c081018252600160a060020a033381168083528a821660208085019182528486018c8152606086018c8152608087018c8152600160a0890181815260008c815260028088528c82209b518c54908c1673ffffffffffffffffffffffffffffffffffffffff19918216178d5598518c8501805491909c16991698909817909955935195890195909555905160038801555160048701555160059095019490945590825291819052919091208054918201808255929350918281838015829011610829576000838152602090206108299181019083015b808211156108255760008155600101610811565b5090565b5b505050916000526020600020900160005b5082905550600160a060020a03861660009081526001602081905260409091208054918201808255909190828183801582901161089d5760008381526020902061089d9181019083015b808211156108255760008155600101610811565b5090565b5b505050916000526020600020900160005b50829055506040805186815260208101869052808201859052600160608201529051600160a060020a038089169233909116918491600080516020610a12833981519152919081900360800190a48091505b50949350505050565b604080516c01000000000000000000000000600160a060020a0380891682028352871602601482015260288101859052604881018490526068810183905290519081900360880190205b95945050505050565b600160205281600052604060002081815481101561000057906000526020600020900160005b91509150505481565b600080805b8351821015610a055783828151811015610000576020908102909101810151600081815260029092526040909120600501549091506001146109d65760009250610552565b600081815260026020526040902060030154429010156109f95760009250610552565b5b600190910190610991565b600192505b50509190505600f15b386eb7776c0bcfff267d12796fdec72bf68313d8608be4ac55331d8128caa165627a7a72305820944d9b3aa0616de1c7c5998dc495736d54ac5ac9110261c055df341486f311090029",
    "events": {
      "0xf15b386eb7776c0bcfff267d12796fdec72bf68313d8608be4ac55331d8128ca": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": true,
            "name": "hold_id",
            "type": "bytes32"
          },
          {
            "indexed": true,
            "name": "user",
            "type": "address"
          },
          {
            "indexed": true,
            "name": "company",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "price",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "expiry",
            "type": "uint256"
          },
          {
            "indexed": false,
            "name": "external_id",
            "type": "bytes32"
          },
          {
            "indexed": false,
            "name": "status",
            "type": "uint256"
          }
        ],
        "name": "LogHoldChange",
        "type": "event"
      }
    },
    "updated_at": 1485631330499,
    "links": {},
    "address": "0x89c3c6b7a9a1f9b95dbf0d599b2680f35be47b6b"
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "Atomic";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.Atomic = Contract;
  }
})();
