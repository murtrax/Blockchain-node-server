const mongoose = require('mongoose');
const nodeOne = require('./models/nodeOne');
const morgan = require('morgan');
const SmartChain = require('./node-komodo-rpc');

//Komodo-RPC declarations
config = {
	rpchost: '54.94.38.223',
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

resetDB = () => {
	nodeOne
		.updateMany({ $or: [ { status: 'success' }, { status: 'copied' } ] }, { status: 'pending' })
		.then((response) => {
			console.log(response);
		});
};

const sleep = (ms) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

combinePendingTxs = (array, pendingTxs) => {
	//make this global
	let x = -1;
	if (!array.length > 0) {
		array[0] = {};
		array[1] = {};
	}
	pendingTxs.forEach((element) => {
		let id = [];
		element.type === '1' ? (x = 0) : (x = 1);

		if (array[x][element.address] == undefined) {
			array[x][element.address] = { cost: 0, id: [] };
		}
		id = array[x][element.address].id;
		id.push(element._id);

		array[x][element.address] = {
			cost: array[x][element.address].cost + parseFloat(element.cost) * parseInt(element.amount),
			id: id
		};
	});
	return array;
};

const purchaseStock = async (address, amount, idArray) => {
	return sleep(5000).then(async (v) => {
		return new Promise((resolve, reject) => {
			komodoRPC.z_getbalance(address).then((balance) => {
				if (balance > amount) {
					utxoNum(
						'zs18t53rvgl65r6tjhflj4epsxk354qzvzxl7msknye6s29l4sxne3cu3jstcl3ud43nx8xv9q87xe',
						amount
					).then((response) => {
						komodoRPC.z_sendmany(address, response).then((info) => {
							resolve({ id: idArray, opid: info, status: 'pending' });
						});
					});
				}
			});
		});
	});
};

function utxoNum(address, amount) {
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

const sellStock = async (array, amount) => {
	return sleep(5000).then(async (v) => {
		return new Promise((resolve, reject) => {
			komodoRPC.z_getbalance(companyAddress).then((balance) => {
				if (balance > amount) {
					utxoNumSell(array).then((response) => {
						komodoRPC.z_sendmany(companyAddress, response.pendingTxs).then((info) => {
							resolve({ id: response.idArray, opid: info, status: 'pending' });
						});
					});
				}
			});
		});
	});
};

function utxoNumSell(array) {
	return new Promise((resolve, reject) => {
		let pendingTxs = [];
		let address = '';
		let amount = '';
		let idArray = [];
		let counter = 0;
		array.forEach((element) => {
			address = element.address;
			amount = element.cost;
			element.idArray.forEach((element) => {
				idArray.push(element);
			});
			let x = 0;
			if (amount < 500) {
				pendingTxs.push({ address: address, amount: amount.toFixed(4) });
				counter++;
			} else {
				let remainder = amount % 500;
				amount = amount - remainder;
				let divisor = amount / 500;
				for (x = 0; x < divisor; x++) {
					pendingTxs.push({ address: address, amount: 500 });
				}
				if (x == divisor) {
					pendingTxs.push({ address: address, amount: remainder.toFixed(4) });
				}
				counter++;
			}
			if (counter === array.length) {
				console.log('resolving');
				resolve({ pendingTxs: pendingTxs, idArray: idArray });
			}
		});
	});
}

//This function could be needed in the future
groupByKey = (pendingTxs, key) => {
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

const opidFtc = () => {
	return new Promise(async (resolve, reject) => {
		console.log('---------------------------');
		console.log('Check Status Method Executed');
		const promises = copiedArray.map(checkStatus);
		await Promise.all(promises);
		console.log('Done!');
		resolve();
	});
};

const checkStatus = (element, index) => {
	return new Promise((resolve, reject) => {
		if (element.opid) {
			asyncGetOPIDStatus(element.opid).then((response) => {
				if (response[0].status == 'success') {
					console.log('Status Success', element.opid, response[0].status);
					opid.push({ id: [ element._id ], opid: element.opid, status: 'success' });
					resolve();
				} else if (response[0].status == 'queued' || response[0].status == 'executing') {
					console.log('Status Queue||Executing', element.opid, response[0].status);
					temp.splice(index, index);
					resolve();
				} else if (response[0].status === 'failed') {
					console.log('Status Fail, push to array', element.opid, response[0].status);
					opid.push({ id: [ element._id ], opid: element.opid, status: 'retry' });
					element.status = 'pending';
					element.opid = '';
					pendingArray.push(element);
					resolve();
				}
			});
		} else resolve();
	});
};

const asyncGetOPIDStatus = (opid) => {
	return new Promise((resolve, reject) => {
		komodoRPC.z_getoperationstatus([ opid ]).then((response) => {
			resolve(response);
		});
	});
};

const bulkUpdate = (array, callback) => {
	return new Promise((resolve, reject) => {
		var bulk = nodeOne.collection.initializeOrderedBulkOp();
		array.forEach((element) => {
			element.id.forEach((item) => {
				if (element.status === 'success') {
					bulk.find({ _id: item }).updateOne({ $set: { status: 'success' } });
				} else if (element.status === 'retry') {
					bulk.find({ _id: item }).updateOne({ $set: { status: 'retry', opid: '' } });
				} else {
					bulk.find({ _id: item }).updateOne({ $set: { status: 'copied', opid: element.opid } });
				}
			});
		});

		bulk.execute(function(error) {
			console.log('executing bulk');
			callback('resolved');
			resolve();
		});
	});
};

const execute = async () => {
	return sleep(5000).then(async (v) => {
		console.log('start');
		console.log('---------------------');
		console.log('Printing PendingTxs Array');
		console.log(pendingTxs);
		console.log('---------------------');
		console.log('Printing Pending Array');
		console.log(pendingArray);
		await nodeOne.find({ status: 'pending' }).limit(6).then(async (response) => {
			nodeOne.find({ status: 'copied' }).then((response) => {
				response.map((element) => {
					if (element.status === 'copied') {
						console.log(element._id, 'Status is Copied');
						copiedArray.push(element);
					}
				});
				console.log('---------------------');
			});
			response.map((element) => {
				if (element.status === 'pending') {
					console.log(element._id, 'Status is pending');
					pendingArray.push(element);
				}
			});

			pendingTxs = combinePendingTxs(pendingTxs, pendingArray);
			pendingArray = [];
			console.log('---------------------');
			if (Object.keys(pendingTxs[0]).length) {
				for (var prop in pendingTxs[0]) {
					await purchaseStock(prop, pendingTxs[0][prop].cost, pendingTxs[0][prop].id).then((response) => {
						console.log('Inside method purchase', response);
						opid.push(response);
					});
				}
				pendingTxs[0] = {};
			}

			if (Object.keys(pendingTxs[1]).length) {
				let groupedSellTxs = [];
				let cost = 0;
				for (var prop in pendingTxs[1]) {
					groupedSellTxs.push({
						address: prop,
						cost: pendingTxs[1][prop].cost,
						idArray: pendingTxs[1][prop].id
					});
					cost += parseFloat(pendingTxs[1][prop].cost);
				}
				await sellStock(groupedSellTxs, cost).then((response) => {
					console.log('Inside method sell', response);
					opid.push(response);
				});
				pendingTxs[1] = {};
			}

			temp = copiedArray;
			console.log('---------------------');
			console.log('Printing opid array');
			console.log(opid);
			console.log('---------------------');
			console.log('Printing Copied array');
			console.log(copiedArray);

			await opidFtc();
			copiedArray = [];
			await bulkUpdate(opid, (res) => {
				opid = [];
				console.log(res);
			});

			console.log('---------------------');
			console.log('Printing PendingTXS Array');
			console.log(pendingTxs);
			console.log('---------------------');
			console.log('Printing Pending Array');
			console.log(pendingArray);
			console.log('END');
			console.log('---------------------');
			console.log('---------------------');
			console.log('---------------------');
			return 'doni boi';
		});
	});
};

const run = async () => {
	while (true) {
		await execute();
	}
};

run();
// resetDB()
