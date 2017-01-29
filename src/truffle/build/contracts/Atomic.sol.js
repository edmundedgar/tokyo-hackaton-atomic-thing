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
        "constant": true,
        "inputs": [
          {
            "name": "this_company",
            "type": "address"
          },
          {
            "name": "idx",
            "type": "uint256"
          }
        ],
        "name": "companyHoldAtIndex",
        "outputs": [
          {
            "name": "hold_id",
            "type": "bytes32"
          },
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
          },
          {
            "name": "has_next",
            "type": "bool"
          },
          {
            "name": "detail_url",
            "type": "string"
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
            "name": "user",
            "type": "address"
          }
        ],
        "name": "countUserHolds",
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
          },
          {
            "name": "detail_url",
            "type": "string"
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
          },
          {
            "name": "detail_url",
            "type": "string"
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
            "name": "this_user",
            "type": "address"
          },
          {
            "name": "idx",
            "type": "uint256"
          }
        ],
        "name": "userHoldAtIndex",
        "outputs": [
          {
            "name": "hold_id",
            "type": "bytes32"
          },
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
          },
          {
            "name": "has_next",
            "type": "bool"
          },
          {
            "name": "detail_url",
            "type": "string"
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
            "name": "company",
            "type": "address"
          }
        ],
        "name": "countCompanyHolds",
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
          },
          {
            "indexed": false,
            "name": "detail_url",
            "type": "string"
          }
        ],
        "name": "LogHoldChange",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x606060405234610000575b61147b806100196000396000f300606060405236156100bf5763ffffffff60e060020a6000350416630d62cd3b81146100c45780631ff7f2a8146100e85780632f48509f1461010a57806344fabe8a146101fe578063655866071461025d5780637175a3c21461028857806371c6823f1461035a57806377aba7c4146103d157806386da32c514610433578063a6ae557d14610461578063d607ffe214610485578063e5535cb0146104bf578063f0fd6e62146105b3578063f2a486b0146105e1578063f56f516f1461060c575b610000565b34610000576100d4600435610670565b604080519115158252519081900360200190f35b34610000576100f86004356107c6565b60408051918252519081900360200190f35b3461000057610126600160a060020a03600435166024356107de565b604080518a8152600160a060020a03808b16602080840191909152908a1692820192909252606081018890526080810187905260a0810186905260c0810185905283151560e0820152610120610100820181815284519183019190915283519192909161014084019185019080838382156101bc575b8051825260208311156101bc57601f19909201916020918201910161019c565b505050905090810190601f1680156101e85780820380516001836020036101000a031916815260200191505b509a505050505050505050505060405180910390f35b6100d46004808035906020019082018035906020019080806020026020016040519081016040528093929190818152602001838360200280828437509496506109c195505050505050565b604080519115158252519081900360200190f35b34610000576100f8600160a060020a0360043516610b80565b60408051918252519081900360200190f35b3461000057610298600435610b9f565b60408051600160a060020a03808a16825288166020820152908101869052606081018590526080810184905260a0810183905260e060c0820181815283546002610100600183161581026000190190921604928401839052909190830190849080156103455780601f1061031a57610100808354040283529160200191610345565b820191906000526020600020905b81548152906001019060200180831161032857829003601f168201915b50509850505050505050505060405180910390f35b3461000057604080516020601f6084356004818101359283018490048402850184019095528184526100f894600160a060020a03813516946024803595604435956064359560a4949301918190840183828082843750949650610be795505050505050565b60408051918252519081900360200190f35b34610000576100f8600480803590602001908201803590602001908080602002602001604051908101604052809392919081815260200183836020028082843750949650610f1395505050505050565b60408051918252519081900360200190f35b34610000576100f8600160a060020a0360043516602435610fa4565b60408051918252519081900360200190f35b34610000576100d4600435610fd3565b604080519115158252519081900360200190f35b34610000576100f8600160a060020a0360043581169060243516604435606435608435611126565b60408051918252519081900360200190f35b3461000057610126600160a060020a0360043516602435611179565b604080518a8152600160a060020a03808b16602080840191909152908a1692820192909252606081018890526080810187905260a0810186905260c0810185905283151560e0820152610120610100820181815284519183019190915283519192909161014084019185019080838382156101bc575b8051825260208311156101bc57601f19909201916020918201910161019c565b505050905090810190601f1680156101e85780820380516001836020036101000a031916815260200191505b509a505050505050505050505060405180910390f35b34610000576100f8600160a060020a036004351660243561135c565b60408051918252519081900360200190f35b34610000576100f8600160a060020a036004351661138b565b60408051918252519081900360200190f35b34610000576100d46004808035906020019082018035906020019080806020026020016040519081016040528093929190818152602001838360200280828437509496506113aa95505050505050565b604080519115158252519081900360200190f35b60008181526002602052604081206001015433600160a060020a0390811691161461069a57610000565b60008281526002602081905260409091206005015414156106bd575060006107c1565b600082815260026020818152604080842060058101859055600180820154825483870154600385015460048601548751838152988901829052968801879052606088018a905260a0608089018181526006909701805496871615610100026000190190961699909904988801899052600160a060020a039384169992909316978b9760008051602061143083398151915297929694959294909160c0830190849080156107ab5780601f10610780576101008083540402835291602001916107ab565b820191906000526020600020905b81548152906001019060200180831161078e57829003601f168201915b5050965050505050505060405180910390a45060015b919050565b6000818152600260205260409020600501545b919050565b600060006000600060006000600060006020604051908101604052806000815250600060006000600160008f600160a060020a0316600160a060020a03168152602001908152602001600020805490508d101561086b57600160a060020a038e16600090815260016020526040902080548e9081101561000057906000526020600020900160005b505492505b600160008f600160a060020a0316600160a060020a03168152602001908152602001600020805490508d6001011091506002600084600019166000191681526020019081526020016000209050828160000160009054906101000a9004600160a060020a03168260010160009054906101000a9004600160a060020a031683600201548460030154856004015486600501548888600601808054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156109975780601f1061096c57610100808354040283529160200191610997565b820191906000526020600020905b81548152906001019060200180831161097a57829003601f168201915b505050505090509b509b509b509b509b509b509b509b509b505b5050509295985092959850929598565b600080805b8351821015610b78578382815181101561000057602090810290910181015160008181526002909252604090912060050154909150600114610a0757610000565b60008181526002602052604090206003015442901015610a2657610000565b60008181526002602081905260408083206005810183905560018101549201549051600160a060020a039092169281156108fc029290818181858888f193505050501515610a7357610000565b6000818152600260208181526040928390206001808201548254838601546003850154600486015489518381529788018290529887018990526060870188905260a06080880181815260069097018054968716156101000260001901909616899004908801819052600160a060020a039485169993909416978a9760008051602061143083398151915297939692959193909160c083019084908015610b5a5780601f10610b2f57610100808354040283529160200191610b5a565b820191906000526020600020905b815481529060010190602001808311610b3d57829003601f168201915b5050965050505050505060405180910390a45b6001909101906109c6565b5b5050919050565b600160a060020a0381166000908152602081905260409020545b919050565b60026020819052600091825260409091208054600182015492820154600383015460048401546005850154600160a060020a0394851696909416949293919290919060060187565b60006000610bf83388888888611126565b6040805160e081018252600160a060020a0333811682528a811660208084019182528385018c8152606085018c8152608086018c8152600160a0880181815260c089018e815260008c815260028089529b81208b518154908c1673ffffffffffffffffffffffffffffffffffffffff199182161782559951818601805491909c169a16999099179099559451878b01559251600387015590516004860155905160058501559051805160068501805481885296859020999a5096989497601f93871615610100026000190190961695909504820183900484019493920190839010610cee57805160ff1916838001178555610d1b565b82800160010185558215610d1b579182015b82811115610d1b578251825591602001919060010190610d00565b5b50610d3c9291505b80821115610d385760008155600101610d24565b5090565b505050600160a060020a0333166000908152602081905260409020805460018101808355919250908281838015829011610d9b57600083815260209020610d9b9181019083015b80821115610d385760008155600101610d24565b5090565b5b505050916000526020600020900160005b5082905550600160a060020a038716600090815260016020819052604090912080549182018082559091908281838015829011610e0f57600083815260209020610e0f9181019083015b80821115610d385760008155600101610d24565b5090565b5b505050916000526020600020900160005b839091909150906000191690555086600160a060020a031633600160a060020a0316826000191660008051602061143083398151915289898960018a60405180868152602001858152602001846000191660001916815260200183815260200180602001828103825283818151815260200191508051906020019080838360008314610ec8575b805182526020831115610ec857601f199092019160209182019101610ea8565b505050905090810190601f168015610ef45780820380516001836020036101000a031916815260200191505b50965050505050505060405180910390a48091505b5095945050505050565b60008080805b8451831015610f985784838151811015610000576020908102909101810151600081815260029092526040909120600501549091506001148015610f6e57506000818152600260205260409020600301544290115b15610f8c576000818152600260208190526040909120015491909101905b5b600190920191610f19565b8193505b505050919050565b600060205281600052604060002081815481101561000057906000526020600020900160005b91509150505481565b60008181526002602052604081205433600160a060020a0390811691161461069a57610000565b60008281526002602081905260409091206005015414156106bd575060006107c1565b600082815260026020818152604080842060058101859055600180820154825483870154600385015460048601548751838152988901829052968801879052606088018a905260a0608089018181526006909701805496871615610100026000190190961699909904988801899052600160a060020a039384169992909316978b9760008051602061143083398151915297929694959294909160c0830190849080156107ab5780601f10610780576101008083540402835291602001916107ab565b820191906000526020600020905b81548152906001019060200180831161078e57829003601f168201915b5050965050505050505060405180910390a45060015b919050565b604080516c01000000000000000000000000600160a060020a0380891682028352871602601482015260288101859052604881018490526068810183905290519081900360880190205b95945050505050565b600060006000600060006000600060006020604051908101604052806000815250600060006000600060008f600160a060020a0316600160a060020a03168152602001908152602001600020805490508d101561120657600160a060020a038e16600090815260208190526040902080548e9081101561000057906000526020600020900160005b505492505b600060008f600160a060020a0316600160a060020a03168152602001908152602001600020805490508d6001011091506002600084600019166000191681526020019081526020016000209050828160000160009054906101000a9004600160a060020a03168260010160009054906101000a9004600160a060020a031683600201548460030154856004015486600501548888600601808054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156109975780601f1061096c57610100808354040283529160200191610997565b820191906000526020600020905b81548152906001019060200180831161097a57829003601f168201915b505050505090509b509b509b509b509b509b509b509b509b505b5050509295985092959850929598565b600160205281600052604060002081815481101561000057906000526020600020900160005b91509150505481565b600160a060020a0381166000908152600160205260409020545b919050565b600080805b83518210156114235783828151811015610000576020908102909101810151600081815260029092526040909120600501549091506001146113f45760009250610b78565b600081815260026020526040902060030154429010156114175760009250610b78565b5b6001909101906113af565b600192505b505091905056006bfbeb99ecf9e25e4bb70297568831e594882aee66797285cfdbfa02bf7a3b3aa165627a7a723058203017e71af6d897ed97e5b271c4000ca0c7b45d1cfa5ea3994955560e947e96fd0029",
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
      },
      "0x6bfbeb99ecf9e25e4bb70297568831e594882aee66797285cfdbfa02bf7a3b3a": {
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
          },
          {
            "indexed": false,
            "name": "detail_url",
            "type": "string"
          }
        ],
        "name": "LogHoldChange",
        "type": "event"
      }
    },
    "updated_at": 1485655726231,
    "links": {},
    "address": "0x8d3d9da24f387e12eb1e11dea3419eece4c4aa52"
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
