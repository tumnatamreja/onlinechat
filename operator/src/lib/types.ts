export type ConvStatus = 'WAITING' | 'ACTIVE' | 'CLOSED';
export type SenderType = 'CLIENT' | 'OPERATOR';
export type Department = 'SUPPORT' | 'ORDERS' | 'OTHER';

export const DEPARTMENT_LABELS: Record<Department, string> = {
  SUPPORT: 'Поддръжка',
  ORDERS: 'Поръчки',
  OTHER: 'Друго',
};

export interface Message {
  id: string;
  conversationId: string;
  senderType: SenderType;
  encryptedContent: string;
  nonce: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  timestamp: string;
}

export interface DecryptedMessage extends Message {
  plaintext: string | null; // null if decryption failed
}

export interface Conversation {
  id: string;
  clientPublicKey: string;
  clientLabel: string | null;
  department: Department;
  operatorId: string | null;
  status: ConvStatus;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
  operator?: { username: string } | null;
}
