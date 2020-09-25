const mongoose = require('mongoose');
const nodeOne = require('./models/nodeOne');
const morgan = require('morgan');
const SmartChain = require('./node-komodo-rpc');

//Komodo-RPC declarations
config = {
	rpchost: '54.207.152.105',
	rpcport: 14167,
	rpcuser: 'user1589035635',
	rpcpassword: 'passc21b03c080d927b161e7d74604a4ce6d35f860ac9953dc4e54f19417ce745507c0'
};

const komodo = new SmartChain({ config });
const komodoRPC = komodo.rpc();
const companyAddress = 'zs18t53rvgl65r6tjhflj4epsxk354qzvzxl7msknye6s29l4sxne3cu3jstcl3ud43nx8xv9q87xe';
let opid = [];
let pendingTxs = [];
let temp = [];
//MOngoDB Declaration
const MONGODB_URI =
	'mongodb+srv://murtrax:THEAVENTADOR@cluster0.lkt3k.mongodb.net/Cluster0?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
	useNewUrlParser: true,
	useUnifiedTopology: true
});

mongoose.connection.on('connected', () => {
	console.log('Mongoose is connected!');
});

const sleep = (ms) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

async function utxoNum(address, amount) {
	return new Promise((resolve, reject) => {
		let pendingTxs = [];
		let x = 0;
		if (amount < 500) {
			pendingTxs.push({ address: address, amount: amount });
			resolve(pendingTxs);
		} else {
			let remainder = amount % 500;
			amount = amount - remainder;
			let divisor = amount / 500;
			console.log(divisor);
			console.log(remainder);
			for (x = 0; x < divisor; x++) {
				pendingTxs.push({ address: address, amount: 500 });
			}
			if (x == divisor) {
				pendingTxs.push({ address: address, amount: remainder.toFixed(4) });
				resolve(pendingTxs);
			}
		}
	});
}

groupByKey = async (pendingTxs, key) => {
	return new Promise((resolve, reject) => {
		resolve(
			pendingTxs.reduce((hash, obj) => {
				if (obj[key] === undefined) return hash;
				return Object.assign(hash, {
					[obj[key]]: (hash[obj[key]] || []).concat(obj)
				});
			}, {})
		);
	});
};

combinePendingTxs = (array, pendingTxs) => {
	if (!array.length > 0) {
		array[0] = {};
		array[1] = {};
	}

	pendingTxs.forEach((element) => {
		if (element.type === '1') {
			if (array[0][element.address] == undefined) {
				array[0][element.address] = 0;
			}
			array[0][element.address] = array[0][element.address] + parseFloat(element.cost) * parseInt(element.amount);
		} else if (element.type === '2') {
			if (array[1][element.address] == undefined) {
				array[1][element.address] = 0;
			}
			array[1][element.address] = array[1][element.address] + parseFloat(element.cost) * parseInt(element.amount);
		}
	});
	return array;
};

const purchaseStock = async (address, amount) => {
	return sleep(5000).then(async (v) => {
		return new Promise((resolve, reject) => {
			komodoRPC.z_getbalance(address).then((balance) => {
				// console.log(balance);
				// console.log(amount);
				if (balance > amount) {
					utxoNum(
						'zs18t53rvgl65r6tjhflj4epsxk354qzvzxl7msknye6s29l4sxne3cu3jstcl3ud43nx8xv9q87xe',
						amount
					).then((response) => {
						komodoRPC.z_sendmany(address, response).then((info) => {
							//console.log(info);
							resolve(info);
						});
					});
				}
			});
		});
	});
};

const sellStock = async (address, amount) => {
	return sleep(5000).then(async (v) => {
		komodoRPC.z_getbalance(address).then((balance) => {
			console.log(balance);
			console.log(amount);
			if (balance > amount) {
				utxoNum(
					'zs18t53rvgl65r6tjhflj4epsxk354qzvzxl7msknye6s29l4sxne3cu3jstcl3ud43nx8xv9q87xe',
					amount
				).then((response) => {
					komodoRPC.z_sendmany(address, response).then((info) => {
						console.log(info);
						return info;
					});
				});
			}
		});
	});
};

const asyncgetOPIDStatus = async (opid) => {
	return new Promise((resolve, reject) => {
		komodoRPC
			.z_getoperationstatus([ opid ])
			.then((response) => {
				//console.log(response);
				resolve(response);
			})
			.catch((error) => console.log(error));
	});
};

const opidFtc = async () => {
	return new Promise(async (resolve, reject) => {
		const promises = opid.map(checkStatus);
		await Promise.all(promises);
		console.log('Done!');
		resolve();
	});
};

const checkStatus = async (element, index) => {
	return new Promise((resolve, reject) => {
		asyncgetOPIDStatus(element.opid).then((response) => {
			// console.log(element.txs.type);
			if (
				response[0].status == 'success' ||
				response[0].status == 'queued' ||
				response[0].status == 'executing'
			) {
				temp.splice(index, index);
				resolve();
			} else if (response[0].status === 'failed') {
				if (element.txs.type === '1') {
					pendingTxs[0][Object.keys(element.txs)[0]] = element.txs[Object.keys(element.txs)[0]];
					resolve();
				} else if (element.txs.type === '2') {
					pendingTxs[1][Object.keys(element.txs)[0]] = element.txs[Object.keys(element.txs)[0]];
					resolve();
				}
			}
		});
	});
};

const execute = async () => {
	console.log('start');
	await nodeOne.find({status: "pending" }).limit(5).then(async (response) => {
		pendingTxs = combinePendingTxs(pendingTxs, response);

		console.log('Printing pendingTxs array');
		console.log(pendingTxs);
		console.log('------------------------------');

		if (pendingTxs[0]) {
			for (var prop in pendingTxs[0]) {
				let txs = {};
				txs[prop] = pendingTxs[0][prop];
				txs['type'] = '1';
				opid.push({ opid: await purchaseStock(prop, pendingTxs[0][prop]), txs: txs });
			}

			pendingTxs[0] = {};
		}

		if (pendingTxs[1]) {
			for (var prop in pendingTxs[1]) {
				console.log('Insinde prop2');
				console.log(prop, pendingTxs[1][prop]);
				console.log('------------------------------');
			}
			pendingTxs[1] = {};
		}

		temp = opid;

		await opidFtc();
	});
};

const run = async () => {
	while (true) {
		await execute();
	}
};

run();

