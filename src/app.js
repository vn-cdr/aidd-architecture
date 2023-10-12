const admin = require("firebase-admin");

// 配置したサービスアカウントの秘密鍵を取得
const serviceAccount = require("../.secret/sessioncookie-4f741-firebase-adminsdk-rp8cy-2541bc1fb8.json");

// firebase-adminを初期化
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// firestoreのインスタンスを取得
const db = admin.firestore();
const {Datastore} = require('@google-cloud/datastore');

// Creates a client
const datastore = new Datastore();


async function quickstart() {

  const key = datastore.key({
    namespace: 'Customer',
    path: ['increment', 5634161670881280],
  });

  // get the entity
  result = await datastore.get(key);
  result = result[0].value
  //console.log(result[0].value);
  const resultplus = result + 1;
  const task = {
    value: resultplus,
  };

  console.log(resultplus);

  const entity = {
    key: key,
    data: task,
  };

  await datastore.update(entity);

}
quickstart();