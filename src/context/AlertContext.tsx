/**
 * AppAlert — Web-safe alert/confirm modal (replaces Alert.alert on RN web)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';

export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type AlertState = {
  title: string;
  message?: string;
  buttons: AlertButton[];
} | null;

type AlertContextType = {
  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
};

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<AlertState>(null);

  const showAlert = useCallback(
    (title: string, message?: string, buttons?: AlertButton[]) => {
      setAlert({
        title,
        message,
        buttons: buttons?.length
          ? buttons
          : [{ text: 'OK', style: 'default' }],
      });
    },
    [],
  );

  const dismiss = useCallback(() => setAlert(null), []);

  const handlePress = useCallback(
    (button: AlertButton) => {
      dismiss();
      button.onPress?.();
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showAlert }), [showAlert]);

  return (
    <AlertContext.Provider value={value}>
      {children}
      <Modal
        visible={!!alert}
        transparent
        animationType="fade"
        onRequestClose={dismiss}
      >
        <Pressable style={styles.backdrop} onPress={dismiss}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            {alert && (
              <>
                <Text style={styles.title}>{alert.title}</Text>
                {!!alert.message && (
                  <Text style={styles.message}>{alert.message}</Text>
                )}
                <View style={styles.actions}>
                  {alert.buttons.map((btn, idx) => (
                    <TouchableOpacity
                      key={`${btn.text}-${idx}`}
                      onPress={() => handlePress(btn)}
                      style={[
                        styles.button,
                        btn.style === 'destructive' && styles.buttonDestructive,
                        btn.style === 'cancel' && styles.buttonCancel,
                      ]}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.buttonText,
                          btn.style === 'destructive' && styles.buttonTextDestructive,
                          btn.style === 'cancel' && styles.buttonTextCancel,
                        ]}
                      >
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAppAlert(): AlertContextType {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error('useAppAlert must be used within AlertProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1E3A5F',
  },
  buttonCancel: {
    backgroundColor: '#F1F5F9',
  },
  buttonDestructive: {
    backgroundColor: '#FEE2E2',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  buttonTextCancel: {
    color: '#475569',
  },
  buttonTextDestructive: {
    color: '#DC2626',
  },
});
