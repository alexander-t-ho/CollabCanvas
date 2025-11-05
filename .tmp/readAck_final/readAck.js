'use strict';

const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
const { DynamoDBClient, GetItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');

const REGION = process.env.AWS_REGION || 'us-east-1';
const MESSAGES_TABLE = process.env.MESSAGES_TABLE || 'Messages_AlexHo';
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'Connections_AlexHo';

const ddb = new DynamoDBClient({ region: REGION });

exports.handler = async (event) => {
  console.info('readAck Event:', event);

  try {
    const { requestContext = {}, body } = event || {};
    const { domainName, stage } = requestContext;

    const endpoint = domainName && stage ? `https://${domainName}/${stage}` : undefined;
    const mgmt = endpoint ? new ApiGatewayManagementApiClient({ endpoint, region: REGION }) : null;

    let payload;
    try {
      payload = typeof body === 'string' ? JSON.parse(body) : (body || {});
    } catch (e) {
      console.warn('Failed to parse body JSON, continuing with empty object');
      payload = {};
    }

    const conversationId = payload.conversationId;
    const messageIds = Array.isArray(payload.messageIds) ? payload.messageIds : [];
    const readAt = payload.readAt || new Date().toISOString();

    if (!mgmt || !messageIds.length) {
      console.warn('Missing mgmt client or no messageIds; returning 200 early');
      return { statusCode: 200, body: 'ok' };
    }

    for (const messageId of messageIds) {
      let senderId = null;
      let resolvedConversationId = conversationId;

      try {
        const getRes = await ddb.send(new GetItemCommand({
          TableName: MESSAGES_TABLE,
          Key: { messageId: { S: messageId } }
        }));
        if (getRes && getRes.Item) {
          senderId = getRes.Item.senderId && getRes.Item.senderId.S ? getRes.Item.senderId.S : senderId;
          if (!resolvedConversationId && getRes.Item.conversationId && getRes.Item.conversationId.S) {
            resolvedConversationId = getRes.Item.conversationId.S;
          }
        }
      } catch (e) {
        console.error('GetItem failed for messageId', messageId, e);
      }

      if (!senderId) {
        console.warn('No senderId resolved for', messageId, '— skipping notify');
        continue;
      }

      let connectionIds = [];
      try {
        const q = await ddb.send(new QueryCommand({
          TableName: CONNECTIONS_TABLE,
          IndexName: 'userId-index',
          KeyConditionExpression: 'userId = :u',
          ExpressionAttributeValues: { ':u': { S: senderId } }
        }));
        if (q && Array.isArray(q.Items)) {
          connectionIds = q.Items.map(it => it.connectionId && it.connectionId.S).filter(Boolean);
        }
      } catch (e) {
        console.error('Query sender connections failed', senderId, e);
      }

      if (!connectionIds.length) {
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
          await mgmt.send(new PostToConnectionCommand({ ConnectionId: cid, Data: data }));
        } catch (err) {
          if (err && (err.statusCode === 410 || err.name === 'GoneException')) {
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
