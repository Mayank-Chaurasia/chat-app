export type ChatDialog = {
    _id: string;
    name?: string;
    type: number; // 1=private, 2=group, 3=public
    last_message?: string;
    last_message_date_sent?: number;
    occupants_ids?: number[];
};

export type ChatMessage = {
    _id?: string;
    message: string;
    date_sent?: number;
    sender_id?: number;
    chat_dialog_id?: string;
};

const getQB = () => (window as any).QB;
const ensureQB = (): any => {
    const qb = getQB();
    if (!qb || !qb.chat) {
        throw new Error('QuickBlox SDK is not initialized');
    }
    return qb;
};

export const listDialogs = async (): Promise<ChatDialog[]> => {
    return new Promise((resolve, reject) => {
        try {
            const QB = ensureQB();
            QB.chat.dialog.list({}, (err: any, res: any) => {
                if (err) reject(err);
                else resolve(res.items || []);
            });
        } catch (e) {
            reject(e);
        }
    });
};

export const listMessages = async (dialogId: string): Promise<ChatMessage[]> => {
    return new Promise((resolve, reject) => {
        try {
            const QB = ensureQB();
            QB.chat.message.list({ chat_dialog_id: dialogId, sort_desc: 'date_sent' }, (err: any, res: any) => {
                if (err) reject(err);
                else resolve((res.items || []).reverse());
            });
        } catch (e) {
            reject(e);
        }
    });
};

export const sendMessage = async (dialogId: string, text: string): Promise<void> => {
    const messageParams = {
        chat_dialog_id: dialogId,
        message: text,
        send_to_chat: 1,
        markable: 1,
    };
    return new Promise((resolve, reject) => {
        try {
            const QB = ensureQB();
            QB.chat.message.create(messageParams, (err: any) => {
                if (err) reject(err);
                else resolve();
            });
        } catch (e) {
            reject(e);
        }
    });
};

export const joinIfNeeded = async (dialog: ChatDialog): Promise<void> => {
    try {
        const QB = ensureQB();
        if (dialog.type === 2 || dialog.type === 3) { // group or public
            const jid = QB.chat.helpers.getRoomJidFromDialogId(dialog._id);
            if (!QB.chat.muc.joinedRooms || !QB.chat.muc.joinedRooms[jid]) {
                await new Promise<void>((resolve, reject) => {
                    QB.chat.muc.join(jid, (res: any) => resolve());
                });
            }
        }
    } catch (e) {
        // ignore; join is best-effort
    }
};

export type MessageListener = (message: ChatMessage) => void;

export const subscribeOnMessages = (listener: MessageListener): void => {
    try {
        const QB = ensureQB();
        QB.chat.onMessageListener = (_userId: number, msg: any) => {
            const normalized: ChatMessage = {
                _id: msg._id || msg.id || undefined,
                message: msg.body || msg.message || '',
                date_sent: Number(msg.date_sent || Date.now() / 1000),
                sender_id: Number(msg.sender_id),
                chat_dialog_id: msg.dialog_id || msg.chat_dialog_id,
            };
            listener(normalized);
        };
    } catch (e) {
        // ignore until QB is ready; ChatUI will re-subscribe when dialog changes
    }
};

export type UserItem = { id: number; full_name?: string; login?: string };
export const searchUsers = async (query: string): Promise<UserItem[]> => {
    return new Promise((resolve, reject) => {
        try {
            const QB = ensureQB();
            const params: any = { per_page: 50 };
            if (query) params.full_name = query;
            QB.users.listUsers(params, (err: any, res: any) => {
                if (err) reject(err); else resolve(res.items || res);
            });
        } catch (e) { reject(e); }
    });
};

export const createPrivateDialog = async (opponentId: number): Promise<ChatDialog> => {
    return new Promise((resolve, reject) => {
        try {
            const QB = ensureQB();
            const params = { type: 1, occupants_ids: [opponentId] };
            QB.chat.dialog.create(params, (err: any, res: any) => {
                if (err) reject(err); else resolve(res);
            });
        } catch (e) { reject(e); }
    });
};

export const createGroupDialog = async (name: string, occupantIds: number[]): Promise<ChatDialog> => {
    return new Promise((resolve, reject) => {
        try {
            const QB = ensureQB();
            const params = { type: 2, name, occupants_ids: occupantIds };
            QB.chat.dialog.create(params, (err: any, res: any) => {
                if (err) reject(err); else resolve(res);
            });
        } catch (e) { reject(e); }
    });
};


