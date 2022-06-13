const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');
const moment = require('moment');


class FireStore {
    async initFireStore() {
        initializeApp({ credential: cert(process.env.KEY) });
        this.db = getFirestore();
        console.log("Running Firestore ID:", this.db.projectId)
    }

    async fetchConfig() {
        const snapshot = await this.db.collection('configuration').doc("master").get()
        if (!snapshot.exists) return console.log('No configuration document!');
        return snapshot.data();    
    }

    async fetchUserInfo(memberObject, method = 'id') {
        if (method === 'id') {
            const doc = await this.db.collection('users').doc(memberObject.id).get()
            if (!doc.exists) {
                await this.addNewUser(memberObject)
                return this.fetchUserInfo(memberObject)
            }
            return doc.data();
        }
        else if (method === 'code') {
            let docData = [];
            const snapshot = await this.db.collection('users').where("code", '==', memberObject.code).get()
            if(snapshot.empty) return;
            snapshot.forEach(doc => { docData.push(doc.data()) })
            return docData[0];
        }
        else return;
    }

    async addNewUser(memberObject) {
        await this.db.collection('users').doc(memberObject.id).set({
            "id": memberObject.id,
            "OG": false,
            "code": crypto.randomBytes(4).toString("hex"),
            "accountCreated": memberObject.createdAt,
            "walletAddress": "",
            "points": 0,
            "suspect": this.timeDiff(memberObject.createdAt),
            "codeUsed": false
        })
        console.log(`Added ${memberObject.username}${memberObject.discriminator} to the user database!`);
        return;
    }

    async addPoints(memberObject) {
        await this.db.collection('users').doc(memberObject.id.toString()).update({
            points: FieldValue.increment(1)
        })
        console.log(`${memberObject.id} points updated!`);
        return;
    }

    async toggleCodeUsed(memberObject) {
        await this.db.collection('users').doc(memberObject.id.toString()).update({
            codeUsed: true
        })
        console.log(`${memberObject.id} codeUsed toggled to true`)
        return;
    }

    timeDiff(createdAt) {
        var timeDifference = moment().diff(createdAt, 'seconds');
        return timeDifference < 2592000;
    }
}

module.exports = FireStore;