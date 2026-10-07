import { router } from 'expo-router';

/** Opens a chat room: general support (room ''), or the room about one order, quotation or return. */
export function openChatRoom(room: string, title: string) {
  router.push({ pathname: '/chat-room', params: { room, title } });
}

export const orderRoom = (reference: string) => [`order:${reference}`, `Order ${reference}`] as const;
export const quoteRoom = (id: number, reference: string) => [`quote:${id}`, `Quotation ${reference}`] as const;
export const returnRoom = (reference: string) => [`return:${reference}`, `Return ${reference}`] as const;
