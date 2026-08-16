/**
 * Printable payslip layout + print helper (table style)
 */

import React from 'react';
import { View, Text, TouchableOpacity, Platform, ScrollView, StyleSheet } from 'react-native';
import { useLanguage } from '../../context/LanguageContext';
import type { Payslip } from '../../types';
import { colors } from '../../constants/colors';

function TableHeader() {
  const { t } = useLanguage();
  return (
    <View style={[styles.row, styles.headerRow]}>
      <Text style={[styles.cellDesc, styles.headerText]}>{t('reason')}</Text>
      <Text style={[styles.cellAmt, styles.headerText]}>{t('gross')}</Text>
    </View>
  );
}

function TableRow({
  label,
  amount,
  tone = 'default',
  bold,
}: {
  label: string;
  amount: string;
  tone?: 'default' | 'deduction' | 'total' | 'net';
  bold?: boolean;
}) {
  const amountColor =
    tone === 'deduction' ? colors.danger : tone === 'net' ? colors.primary : colors.surface800;
  return (
    <View style={[styles.row, tone === 'net' && styles.netRow, tone === 'total' && styles.totalRow]}>
      <Text style={[styles.cellDesc, bold && styles.bold, tone === 'net' && styles.netText]}>
        {label}
      </Text>
      <Text
        style={[
          styles.cellAmt,
          bold && styles.bold,
          { color: amountColor },
          tone === 'net' && styles.netText,
        ]}
      >
        {amount}
      </Text>
    </View>
  );
}

export function PayslipPrintView({ payslip }: { payslip: Payslip }) {
  const { t } = useLanguage();
  return (
    <View className="bg-white p-6" collapsable={false}>
      <Text className="text-2xl font-bold text-surface-800">{t('payslipDetail')}</Text>
      <Text className="text-surface-500 mt-1">
        {payslip.userName} · {payslip.employeeId}
      </Text>
      <Text className="text-surface-400 text-sm mb-4">
        {t('date')}: {payslip.period}
      </Text>

      <View style={styles.table}>
        <TableHeader />

        <View style={styles.sectionBanner}>
          <Text style={styles.sectionText}>
            {t('earnings')} ({t('step1')})
          </Text>
        </View>
        {payslip.earnings.map((line, i) => (
          <TableRow key={`e-${i}`} label={line.label} amount={line.amount.toFixed(2)} />
        ))}
        <TableRow
          label={t('basicSalary')}
          amount={(payslip.monthlyBaseEarnings ?? payslip.grossPay).toFixed(2)}
          bold
          tone="total"
        />

        <View style={styles.sectionBanner}>
          <Text style={styles.sectionText}>
            {t('reductions')} ({t('step2')})
          </Text>
        </View>
        {payslip.deductions
          .filter((d) =>
            [
              'absent',
              'checkin_penalty',
              'checkout_penalty',
              'loan',
              'unpaid_vacation',
              'penalty',
              'lateness',
            ].includes(d.code),
          )
          .map((line, i) => (
            <TableRow
              key={`r-${i}`}
              label={line.label}
              amount={`-${line.amount.toFixed(2)}`}
              tone="deduction"
            />
          ))}
        <TableRow
          label={t('deductions')}
          amount={(payslip.totalReductions ?? 0).toFixed(2)}
          bold
          tone="total"
        />
        <TableRow
          label={`${t('adjustedGross')} (${t('step3')})`}
          amount={(payslip.adjustedGross ?? payslip.grossPay).toFixed(2)}
          bold
        />

        <View style={styles.sectionBanner}>
          <Text style={styles.sectionText}>
            {t('statutory')} ({t('steps45')})
          </Text>
        </View>
        {payslip.employeeInsurance != null && payslip.employeeInsurance > 0 && (
          <TableRow
            label={t('insurance')}
            amount={`-${payslip.employeeInsurance.toFixed(2)}`}
            tone="deduction"
          />
        )}
        {payslip.taxableIncome != null && (
          <TableRow label={t('tax')} amount={payslip.taxableIncome.toFixed(2)} />
        )}
        {payslip.incomeTax != null && payslip.incomeTax > 0 && (
          <TableRow
            label={t('tax')}
            amount={`-${payslip.incomeTax.toFixed(2)}`}
            tone="deduction"
          />
        )}
        {payslip.employerInsurance != null && payslip.employerInsurance > 0 && (
          <TableRow label={t('insurance')} amount={payslip.employerInsurance.toFixed(2)} />
        )}

        <TableRow
          label={t('deductions')}
          amount={payslip.totalDeductions.toFixed(2)}
          bold
          tone="total"
        />
        <TableRow label={t('netPay')} amount={payslip.netPay.toFixed(2)} bold tone="net" />
      </View>
    </View>
  );
}

export function PrintPayslipButton({ payslip }: { payslip: Payslip }) {
  const { t } = useLanguage();
  const onPrint = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print();
      return;
    }
  };

  return (
    <TouchableOpacity
      onPress={onPrint}
      className="bg-primary-500 rounded-xl h-12 items-center justify-center mt-4"
    >
      <Text className="text-white font-semibold">{t('print')}</Text>
    </TouchableOpacity>
  );
}

export default function PayslipDetailScreen({ route }: any) {
  const { t } = useLanguage();
  const payslip = route?.params?.payslip as Payslip | undefined;
  if (!payslip) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-surface-400">{t('notFound')}</Text>
      </View>
    );
  }
  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingBottom: 40 }}>
      <PayslipPrintView payslip={payslip} />
      <View className="px-6">
        <PrintPayslipButton payslip={payslip} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    backgroundColor: '#F1F5F9',
  },
  sectionBanner: {
    backgroundColor: colors.primary50,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  sectionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  headerText: {
    fontWeight: '700',
    color: '#64748B',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  cellDesc: {
    flex: 1,
    fontSize: 14,
    color: '#475569',
    paddingRight: 8,
  },
  cellAmt: {
    width: 110,
    textAlign: 'right',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  bold: {
    fontWeight: '700',
    color: '#1E293B',
  },
  totalRow: {
    backgroundColor: '#F8FAFC',
  },
  netRow: {
    backgroundColor: colors.primary50,
    borderBottomWidth: 0,
  },
  netText: {
    color: colors.primary,
    fontSize: 16,
  },
});
