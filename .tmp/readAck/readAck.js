'use strict';

const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB();

const REGION = process.env.AWS_REGION || 'us-east-1';
const MESSAGES_TABLE = process.env.MESSAGES_TABLE || 'Messages_AlexHo';
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'Connections_AlexHo';

exports.handler = async (event) => {
  console.info('readAck Event:', event);

  try {
    const { requestContext = {}, body } = event || {};
    const { domainName, stage } = requestContext;

    const endpoint = (domainName && stage) ? `https://${domainName}/${stage}` : undefined;
    const apigw = endpoint ? new AWS.ApiGatewayManagementApi({ apiVersion: '2018-11-29', endpoint, region: REGION }) : null;

    let payload;
    try {
      payload = typeof body === 'string' ? JSON.parse(body) : (body || {});
    } catch (e) {
      console.warn('Failed to parse body JSON');
      payload = {};
    }

    const conversationId = payload.conversationId;
    const messageIds = Array.isArray(payload.messageIds) ? payload.messageIds : [];
    const readAt = payload.readAt || new Date().toISOString();

    if (!apigw || messageIds.length === 0) {
      console.warn('No ApiGatewayManagementApi client or no messageIds; returning 200');
      return { statusCode: 200, body: 'ok' };
    }

    for (const messageId of messageIds) {
      let senderId = null;
      let resolvedConversationId = conversationId;

      try {
        const getRes = await ddb.getItem({
          TableName: MESSAGES_TABLE,
          Key: { messageId: { S: messageId } }
        }).promise();
        if (getRes && getRes.Item) {
          if (getRes.Item.senderId && getRes.Item.senderId.S) senderId = getRes.Item.senderId.S;
          if (!resolvedConversationId && getRes.Item.conversationId && getRes.Item.conversationId.S) {
            resolvedConversationId = getRes.Item.conversationId.S;
          }
        }
      } catch (e) {
        console.error('GetItem failed for messageId', messageId, e);
      }

      if (!senderId) {
        console.warn('No senderId for', messageId, '— skipping');
        continue;
      }

      let connectionIds = [];
      try {
        const q = await ddb.query({
          TableName: CONNECTIONS_TABLE,
          IndexName: 'userId-index',
          KeyConditionExpression: 'userId = :u',
          ExpressionAttributeValues: { ':u': { S: senderId } }
        }).promise();
        if (q && Array.isArray(q.Items)) {
          connectionIds = q.Items.map(it => it.connectionId && it.connectionId.S).filter(Boolean);
        }
      } catch (e) {
        console.error('Query sender connections failed', senderId, e);
      }

      if (connectionIds.length === 0) {
        console.info('No active sender connections for', senderId);
        continue;
      }

      const data = Buffer.from(JSON.stringify({
        type: 'messageStatus',
        data: {
          conversationId: resolvedConversationId,
          messageId,
          status: 'read',
          readAt
        }
      }));

      for (const cid of connectionIds) {
        try {
          await apigw.postToConnection({ ConnectionId: cid, Data: data }).promise();
        } catch (err) {
          if (err && (err.statusCode === 410 || err.code === 'GoneException' || err.name === 'GoneException')) {
            console.warn('Connection gone, ignoring', cid);
            continue;
          }
          console.error('readAck notify error', err);
        }
      }
    }

  } catch (outerErr) {
    console.error('readAck outer error', outerErr);
  }

  return { statusCode: 200, body: 'ok' };
};
