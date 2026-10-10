import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  onSnapshot,
  deleteDoc,
  getDocs,
  type Firestore,
} from 'firebase/firestore';
import { FIREBASE_CONFIG, MAP_CENTER } from '../config';
import type {
  PlotDoc,
  WalletDoc,
  DisputeDoc,
  BlockedDoc,
  DocumentDoc,
  Address,
  Hash,
} from '../types';
import {
  computeBoundaryHash,
  computePolygonAreaSqm,
  computeDocumentHash,
  generateTitleRecordText,
} from '../utils/crypto';

// Check if Firebase is actually configured with real credentials
const isFirebaseConfigured =
  FIREBASE_CONFIG.apiKey &&
  !FIREBASE_CONFIG.apiKey.includes('PLACEHOLDER') &&
  !FIREBASE_CONFIG.projectId.includes('placeholder');

let firestoreInstance: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
    firestoreInstance = getFirestore(app);
  } catch (err) {
    console.warn('Firebase initialization error, falling back to local store:', err);
    firestoreInstance = null;
  }
}

// ============================================================================
// REACTIVE LOCAL/TAB STORE (Fallback and offline sync)
// ============================================================================

const STORAGE_KEYS = {
  plots: 'pp_store_plots',
  wallets: 'pp_store_wallets',
  disputes: 'pp_store_disputes',
  blocked: 'pp_store_blocked',
  documents: 'pp_store_documents',
};

type Listener<T> = (data: T) => void;
const listeners: Record<string, Set<Listener<any>>> = {
  plots: new Set(),
  wallets: new Set(),
  disputes: new Set(),
  blocked: new Set(),
  documents: new Set(),
};

const broadcast =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('plotproof_events')
    : null;

if (broadcast) {
  broadcast.onmessage = (event) => {
    const { collectionName } = event.data;
    if (collectionName && listeners[collectionName]) {
      const data = getLocalCollection(collectionName as keyof typeof STORAGE_KEYS);
      listeners[collectionName].forEach((cb) => cb(data));
    }
  };
}

function notifyLocalListeners(name: string) {
  if (listeners[name]) {
    const data = getLocalCollection(name as keyof typeof STORAGE_KEYS);
    listeners[name].forEach((cb) => cb(data));
  }
  if (broadcast) {
    broadcast.postMessage({ collectionName: name });
  }
}

function getLocalCollection<T>(key: keyof typeof STORAGE_KEYS): Record<string, T> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[key]);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLocalCollection<T>(key: keyof typeof STORAGE_KEYS, val: Record<string, T>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(val));
    notifyLocalListeners(key);
  } catch (err) {
    console.error('Local storage write error:', err);
  }
}

// Initialize seed plots if none exist
export function generateSeedGrid(): PlotDoc[] {
  const [centerLat, centerLng] = MAP_CENTER;
  const plots: PlotDoc[] = [];
  const rows = 3;
  const cols = 4;
  const dLat = 0.0007; // ~75 meters
  const dLng = 0.0009; // ~95 meters

  let plotId = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const startLat = centerLat + (r - 1) * dLat;
      const startLng = centerLng + (c - 1.5) * dLng;

      // 4 corners of rectangle
      const polygon: [number, number][] = [
        [startLat, startLng],
        [startLat + dLat * 0.85, startLng],
        [startLat + dLat * 0.85, startLng + dLng * 0.85],
        [startLat, startLng + dLng * 0.85],
      ];

      const boundaryHash = computeBoundaryHash(polygon);
      const areaSqm = computePolygonAreaSqm(polygon);
      const surveyNo = `101/${plotId}`;
      const village = 'Shivajinagar';

      const titleDocText = generateTitleRecordText({
        plotId,
        surveyNo,
        village,
        areaSqm,
        owner: '0x0000000000000000000000000000000000000000',
        boundaryHash,
        date: new Date().toISOString(),
      });
      const titleDocHash = computeDocumentHash(titleDocText);

      plots.push({
        id: plotId,
        name: `Cadastral Plot #${plotId}`,
        surveyNo,
        village,
        areaSqm,
        polygon,
        boundaryHash,
        titleDocHash,
        createdAt: Date.now() - (13 - plotId) * 3600000,
      });

      // Also store title record doc
      saveDocument({
        hash: titleDocHash,
        name: `Title-Record-Survey-${surveyNo.replace('/', '-')}.txt`,
        mime: 'text/plain',
        size: titleDocText.length,
        kind: 'title',
        plotId,
        createdBy: '0x0000000000000000000000000000000000000000',
        createdAt: Date.now() - (13 - plotId) * 3600000,
        text: titleDocText,
      });

      plotId++;
    }
  }
  return plots;
}

// Auto seed default plots if local store empty
if (typeof window !== 'undefined') {
  const existing = getLocalCollection<PlotDoc>('plots');
  if (Object.keys(existing).length === 0) {
    const seeds = generateSeedGrid();
    const map: Record<string, PlotDoc> = {};
    seeds.forEach((p) => {
      map[p.id.toString()] = p;
    });
    setLocalCollection('plots', map);
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

export async function savePlot(plot: PlotDoc): Promise<void> {
  // Always update local store
  const local = getLocalCollection<PlotDoc>('plots');
  local[plot.id.toString()] = plot;
  setLocalCollection('plots', local);

  if (firestoreInstance) {
    try {
      await setDoc(doc(firestoreInstance, 'plots', plot.id.toString()), plot);
    } catch (err) {
      console.warn('Firestore write failed for plot:', err);
    }
  }
}

export async function getPlotDoc(id: number): Promise<PlotDoc | null> {
  if (firestoreInstance) {
    try {
      const snap = await getDoc(doc(firestoreInstance, 'plots', id.toString()));
      if (snap.exists()) {
        return snap.data() as PlotDoc;
      }
    } catch (err) {
      console.warn('Firestore read failed, checking local:', err);
    }
  }
  const local = getLocalCollection<PlotDoc>('plots');
  return local[id.toString()] || null;
}

export function subscribePlots(callback: (plots: PlotDoc[]) => void): () => void {
  if (firestoreInstance) {
    try {
      const unsub = onSnapshot(collection(firestoreInstance, 'plots'), (snapshot) => {
        const list: PlotDoc[] = [];
        snapshot.forEach((d) => list.push(d.data() as PlotDoc));
        callback(list.sort((a, b) => a.id - b.id));
      });
      return unsub;
    } catch (err) {
      console.warn('Firestore snapshot failed, using local:', err);
    }
  }

  // Fallback
  const notify = () => {
    const local = getLocalCollection<PlotDoc>('plots');
    callback(Object.values(local).sort((a, b) => a.id - b.id));
  };
  listeners.plots.add(notify);
  notify();
  return () => {
    listeners.plots.delete(notify);
  };
}

export async function saveWallet(wallet: WalletDoc): Promise<void> {
  const local = getLocalCollection<WalletDoc>('wallets');
  local[wallet.address.toLowerCase()] = wallet;
  setLocalCollection('wallets', local);

  if (firestoreInstance) {
    try {
      await setDoc(doc(firestoreInstance, 'wallets', wallet.address.toLowerCase()), wallet);
    } catch (err) {
      console.warn('Firestore saveWallet failed:', err);
    }
  }
}

export function subscribeWallets(callback: (wallets: Record<string, WalletDoc>) => void): () => void {
  if (firestoreInstance) {
    try {
      const unsub = onSnapshot(collection(firestoreInstance, 'wallets'), (snapshot) => {
        const map: Record<string, WalletDoc> = {};
        snapshot.forEach((d) => {
          const w = d.data() as WalletDoc;
          map[w.address.toLowerCase()] = w;
        });
        callback(map);
      });
      return unsub;
    } catch (err) {
      console.warn('Firestore subscribeWallets failed:', err);
    }
  }

  const notify = () => {
    const local = getLocalCollection<WalletDoc>('wallets');
    callback(local);
  };
  listeners.wallets.add(notify);
  notify();
  return () => {
    listeners.wallets.delete(notify);
  };
}

export async function saveDispute(dispute: DisputeDoc): Promise<void> {
  const local = getLocalCollection<DisputeDoc>('disputes');
  local[dispute.plotId.toString()] = dispute;
  setLocalCollection('disputes', local);

  if (firestoreInstance) {
    try {
      await setDoc(doc(firestoreInstance, 'disputes', dispute.plotId.toString()), dispute);
    } catch (err) {
      console.warn('Firestore saveDispute failed:', err);
    }
  }
}

export async function removeDispute(plotId: number): Promise<void> {
  const local = getLocalCollection<DisputeDoc>('disputes');
  delete local[plotId.toString()];
  setLocalCollection('disputes', local);

  if (firestoreInstance) {
    try {
      await deleteDoc(doc(firestoreInstance, 'disputes', plotId.toString()));
    } catch (err) {
      console.warn('Firestore removeDispute failed:', err);
    }
  }
}

export function subscribeDisputes(callback: (disputes: Record<number, DisputeDoc>) => void): () => void {
  if (firestoreInstance) {
    try {
      const unsub = onSnapshot(collection(firestoreInstance, 'disputes'), (snapshot) => {
        const map: Record<number, DisputeDoc> = {};
        snapshot.forEach((d) => {
          const disp = d.data() as DisputeDoc;
          map[disp.plotId] = disp;
        });
        callback(map);
      });
      return unsub;
    } catch (err) {
      console.warn('Firestore subscribeDisputes failed:', err);
    }
  }

  const notify = () => {
    const local = getLocalCollection<DisputeDoc>('disputes');
    const map: Record<number, DisputeDoc> = {};
    Object.values(local).forEach((d) => {
      map[d.plotId] = d;
    });
    callback(map);
  };
  listeners.disputes.add(notify);
  notify();
  return () => {
    listeners.disputes.delete(notify);
  };
}

export async function saveBlocked(blocked: BlockedDoc): Promise<void> {
  const autoId = `blk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fullDoc: BlockedDoc = { ...blocked, id: autoId };

  const local = getLocalCollection<BlockedDoc>('blocked');
  local[autoId] = fullDoc;
  setLocalCollection('blocked', local);

  if (firestoreInstance) {
    try {
      await setDoc(doc(firestoreInstance, 'blocked', autoId), fullDoc);
    } catch (err) {
      console.warn('Firestore saveBlocked failed:', err);
    }
  }
}

export function subscribeBlocked(callback: (blockedList: BlockedDoc[]) => void): () => void {
  if (firestoreInstance) {
    try {
      const unsub = onSnapshot(collection(firestoreInstance, 'blocked'), (snapshot) => {
        const list: BlockedDoc[] = [];
        snapshot.forEach((d) => list.push(d.data() as BlockedDoc));
        callback(list.sort((a, b) => b.ts - a.ts));
      });
      return unsub;
    } catch (err) {
      console.warn('Firestore subscribeBlocked failed:', err);
    }
  }

  const notify = () => {
    const local = getLocalCollection<BlockedDoc>('blocked');
    callback(Object.values(local).sort((a, b) => b.ts - a.ts));
  };
  listeners.blocked.add(notify);
  notify();
  return () => {
    listeners.blocked.delete(notify);
  };
}

export async function saveDocument(docData: DocumentDoc): Promise<void> {
  const local = getLocalCollection<DocumentDoc>('documents');
  local[docData.hash] = docData;
  setLocalCollection('documents', local);

  if (firestoreInstance) {
    try {
      await setDoc(doc(firestoreInstance, 'documents', docData.hash), docData);
    } catch (err) {
      console.warn('Firestore saveDocument failed:', err);
    }
  }
}

export async function getDocument(hash: Hash): Promise<DocumentDoc | null> {
  if (firestoreInstance) {
    try {
      const snap = await getDoc(doc(firestoreInstance, 'documents', hash));
      if (snap.exists()) {
        return snap.data() as DocumentDoc;
      }
    } catch (err) {
      console.warn('Firestore getDocument failed:', err);
    }
  }
  const local = getLocalCollection<DocumentDoc>('documents');
  return local[hash] || null;
}

export function subscribeDocuments(callback: (docs: Record<string, DocumentDoc>) => void): () => void {
  if (firestoreInstance) {
    try {
      const unsub = onSnapshot(collection(firestoreInstance, 'documents'), (snapshot) => {
        const map: Record<string, DocumentDoc> = {};
        snapshot.forEach((d) => {
          const docItem = d.data() as DocumentDoc;
          map[docItem.hash] = docItem;
        });
        callback(map);
      });
      return unsub;
    } catch (err) {
      console.warn('Firestore subscribeDocuments failed:', err);
    }
  }

  const notify = () => {
    const local = getLocalCollection<DocumentDoc>('documents');
    callback(local);
  };
  listeners.documents.add(notify);
  notify();
  return () => {
    listeners.documents.delete(notify);
  };
}

/**
 * Reset demo data: deletes plots, wallets, disputes, blocked, documents
 * because contract was redeployed!
 */
export async function resetDemoData(): Promise<void> {
  if (typeof window !== 'undefined') {
    Object.values(STORAGE_KEYS).forEach((k) => {
      localStorage.removeItem(k);
    });
  }

  if (firestoreInstance) {
    try {
      const collections = ['plots', 'wallets', 'disputes', 'blocked', 'documents'];
      for (const col of collections) {
        const snap = await getDocs(collection(firestoreInstance, col));
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
        }
      }
    } catch (err) {
      console.warn('Firestore resetDemoData failed:', err);
    }
  }

  // Re-seed 12 fresh demo plots
  const seeds = generateSeedGrid();
  const map: Record<string, PlotDoc> = {};
  seeds.forEach((p) => {
    map[p.id.toString()] = p;
  });
  setLocalCollection('plots', map);

  notifyLocalListeners('plots');
  notifyLocalListeners('wallets');
  notifyLocalListeners('disputes');
  notifyLocalListeners('blocked');
  notifyLocalListeners('documents');
}
