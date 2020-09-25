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
//this array stores the OPIDs after txs has been executed
let opid = [];
//this array stores the txs that are to be executed before data has been processedlet pendingArray = [];
let pendingArray = [];
//this array stores the txs that are to be executed and txs data has been cleaned and processed
let pendingTxs = [];
//temp array to update the OPID array
let temp = [];
//Array that contains data from mongoDB of txs that have been executed and need their OPID's checked
let copiedArray = [];
//Array that contains txs that have have their OPIDS returned as success
let executedArray = [];

//MOngoDB Declaration
const MONGODB_URI =
	'mongodb+srv://murtrax:THEAVENTADOR@cluster0.lkt3k.mongodb.net/Cluster0?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	useFindAndModify: true
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
			pendingTxs.push({ address: address, amount: amount.toFixed(4) });
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
		let id = [];
		if (element.type === '1') {
			if (array[0][element.address] == undefined) {
				array[0][element.address] = { cost: 0, id: [] };
			}
			id = array[0][element.address].id;
			id.push(element._id);

			array[0][element.address] = {
				cost: array[0][element.address].cost + parseFloat(element.cost) * parseInt(element.amount),
				id: id
			};
		} else if (element.type === '2') {
			if (array[1][element.address] == undefined) {
				array[1][element.address] = { cost: 0, id: [] };
			}
			id = array[1][element.address].id;
			id.push(element._id);
			array[1][element.address] = {
				cost: array[1][element.address].cost + parseFloat(element.cost) * parseInt(element.amount),
				id: id
			};
		}
	});
	return array;
};

const purchaseStock = async (address, amount, idArray) => {
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
							// console.log(info);
							resolve({ id: idArray, opid: info, status: 'pending' });
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
		const promises = copiedArray.map(checkStatus);
		await Promise.all(promises);
		console.log('Done!');
		resolve();
	});
};

const checkStatus = async (element, index) => {
	return new Promise((resolve, reject) => {
		if (element.opid) {
			// console.log(element.opid);
			asyncgetOPIDStatus(element.opid).then((response) => {
				// console.log(element.txs.type);
				if (response[0].status == 'success') {
					console.log(element.opid, response[0].status);
					opid.push({ id: [element._id], opid: element.opid, status: 'success' });
					resolve();
				} else if (response[0].status == 'queued' || response[0].status == 'executing') {
					console.log(element.opid, response[0].status);
					temp.splice(index, index);
					resolve();
				} else if (response[0].status === 'failed') {
					console.log(element.opid, response[0].status);
					pendingArray.push(element);
					resolve();
				}
			});
		} else resolve();
	});
};

const bulkUpdate = (array, callback) => {
	var bulk = nodeOne.collection.initializeOrderedBulkOp();
	array.forEach((element) => {
		console.log(element)
		element.id.forEach((item) => {
			if (element.status === 'success') {
				bulk.find({ _id: item }).updateOne({ $set: { status: "success" } });
			} else {
				bulk.find({ _id: item }).updateOne({ $set: { opid: element.opid } });
			}
		});
	});

	bulk.execute(function(error) {
		console.log('executing bulk');
		callback('resolved');
	});
};

const execute = async () => {
	console.log('start');
	await nodeOne.find({ $or: [ { status: 'pending' }, { status: 'copied' } ] }).limit(5).then(async (response) => {
		nodeOne.updateMany({ status: 'pending' }, { status: 'copied' }).then((response) => {
			// console.log(response);
		});
		response.map((element) => {
			if (element.status === 'pending') {
				pendingArray.push(element);
			} else {
				copiedArray.push(element);
			}
		});

		pendingTxs = combinePendingTxs(pendingTxs, pendingArray);

		// console.log('Printing pendingTxs array');
		// console.log(pendingTxs);
		// console.log('------------------------------');

		if (pendingTxs[0]) {
			for (var prop in pendingTxs[0]) {
				let txs = {};
				txs[prop] = pendingTxs[0][prop];
				txs['type'] = '1';
				await purchaseStock(prop, pendingTxs[0][prop].cost, pendingTxs[0][prop].id).then((response) => {
					console.log('Inside execute method', response);
					opid.push(response);
				});
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

		temp = copiedArray;
		console.log('---------------------');
		console.log('Printing opid array');
		console.log(opid);
		// console.log('Printing Copied Array', copiedArray);
		// console.log('Printing Pending txs array');
		// console.log(pendingTxs);

		await opidFtc();
		copiedArray = [];
		bulkUpdate(opid, (res) => {
			opid = [];
			console.log(res);
		});
		// copiedArray = temp;
		// console.log('Printing copied Array');
		// console.log(temp);
	});
};

const run = async () => {
	while (true) {
		await execute();
	}
};

run();
