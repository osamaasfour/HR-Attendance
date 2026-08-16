import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import PeriodField from './PeriodField';
import { useLanguage } from '../context/LanguageContext';
import type { Branch, Department } from '../types';

export type FilterOption = { id: string; label: string };

export type ReportFiltersValue = {
  period: string;
  branchId: string;
  departmentId: string;
  employeeQuery: string;
  status: string;
  typeId: string;
};

type Props = {
  value: ReportFiltersValue;
  onChange: (next: ReportFiltersValue) => void;
  branches: Branch[];
  departments: Department[];
  statusOptions: FilterOption[];
  typeOptions?: FilterOption[];
};

function Chip({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`px-3 py-2 rounded-full mr-2 mb-2 ${
        selected ? 'bg-primary-500' : 'bg-white border border-surface-200'
      }`}
    >
      <Text className={`text-xs font-semibold ${selected ? 'text-white' : 'text-surface-600'}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function ReportFilters({
  value,
  onChange,
  branches,
  departments,
  statusOptions,
  typeOptions,
}: Props) {
  const { t } = useLanguage();
  const depts = value.branchId
    ? departments.filter((d) => d.branchId === value.branchId)
    : departments;

  const patch = (partial: Partial<ReportFiltersValue>) => onChange({ ...value, ...partial });

  return (
    <View className="bg-white rounded-2xl p-4 mb-4 border border-surface-100">
      <PeriodField label={t('reportPeriod')} value={value.period} onChange={(period) => patch({ period })} />

      <Text className="text-xs text-surface-400 mt-3 mb-1">{t('branch')}</Text>
      <View className="flex-row flex-wrap">
        <Chip
          selected={!value.branchId}
          label={t('filterAllBranches')}
          onPress={() => patch({ branchId: '', departmentId: '' })}
        />
        {branches.map((b) => (
          <Chip
            key={b.id}
            selected={value.branchId === b.id}
            label={b.name}
            onPress={() =>
              patch({
                branchId: b.id,
                departmentId: '',
              })
            }
          />
        ))}
      </View>

      {depts.length > 0 && (
        <>
          <Text className="text-xs text-surface-400 mt-1 mb-1">{t('department')}</Text>
          <View className="flex-row flex-wrap">
            <Chip
              selected={!value.departmentId}
              label={t('filterAllDepartments')}
              onPress={() => patch({ departmentId: '' })}
            />
            {depts.map((d) => (
              <Chip
                key={d.id}
                selected={value.departmentId === d.id}
                label={d.name}
                onPress={() => patch({ departmentId: d.id })}
              />
            ))}
          </View>
        </>
      )}

      <TextInput
        className="border border-surface-200 rounded-xl px-3 h-11 mt-1 mb-2 bg-white"
        value={value.employeeQuery}
        onChangeText={(employeeQuery) => patch({ employeeQuery })}
        placeholder={t('searchEmployees')}
      />

      {statusOptions.length > 0 && (
        <>
          <Text className="text-xs text-surface-400 mb-1">{t('status')}</Text>
          <View className="flex-row flex-wrap">
            {statusOptions.map((s) => (
              <Chip
                key={s.id}
                selected={value.status === s.id}
                label={s.label}
                onPress={() => patch({ status: s.id })}
              />
            ))}
          </View>
        </>
      )}

      {typeOptions && typeOptions.length > 0 && (
        <>
          <Text className="text-xs text-surface-400 mb-1">{t('requestType')}</Text>
          <View className="flex-row flex-wrap">
            {typeOptions.map((s) => (
              <Chip
                key={s.id}
                selected={value.typeId === s.id}
                label={s.label}
                onPress={() => patch({ typeId: s.id })}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}
