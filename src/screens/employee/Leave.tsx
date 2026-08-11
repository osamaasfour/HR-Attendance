import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useHrRequests, HR_REQUEST_TYPES } from '../../hooks/useHrRequests';
import { useAppAlert } from '../../context/AlertContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import DateField from '../../components/DateField';
import TimeField from '../../components/TimeField';
import RequestDashboard from '../../components/RequestDashboard';
import { uploadHrAttachment } from '../../utils/uploadHrAttachment';
import { requestTypeKey } from '../../i18n/translations';
import type { HrRequestType } from '../../types';

const RANGE_TYPES: HrRequestType[] = ['vacation', 'sick', 'unpaid', 'business_trip'];
const TIME_TYPES: HrRequestType[] = ['early_leave', 'late_arrive', 'missing'];

export default function EmployeeRequestsScreen() {
  const { user } = useAuth();
  const { showAlert } = useAppAlert();
  const { t } = useLanguage();
  const {
    myRequests,
    remainingVacation,
    vacationAllowance,
    usedVacationDays,
    isLoading,
    submitRequest,
    refreshMine,
  } = useHrRequests();

  const [tab, setTab] = useState<'new' | 'status'>('new');
  const [type, setType] = useState<HrRequestType>('vacation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [plannedTime, setPlannedTime] = useState('');
  const [minutes, setMinutes] = useState('');
  const [location, setLocation] = useState('');
  const [attachment, setAttachment] = useState<{
    uri: string;
    name: string;
    mimeType?: string | null;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const needsRange = RANGE_TYPES.includes(type);
  const needsTime = TIME_TYPES.includes(type);

  const pickSickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setAttachment({
        uri: asset.uri,
        name: asset.name || 'sick-document',
        mimeType: asset.mimeType,
      });
    } catch (e: any) {
      showAlert(t('error'), e?.message || t('actionFailed'));
    }
  };

  const onSubmit = async () => {
    if (!startDate) {
      showAlert(t('missing'), t('missingDate'));
      return;
    }
    if (needsRange && !endDate) {
      showAlert(t('missing'), t('missingDates'));
      return;
    }
    if (needsRange && endDate < startDate) {
      showAlert(t('error'), t('invalidRange'));
      return;
    }
    if (type === 'business_trip' && !location.trim()) {
      showAlert(t('missing'), t('missingLocation'));
      return;
    }
    if (type === 'sick' && !attachment) {
      showAlert(t('missing'), t('missingDocument'));
      return;
    }
    if (needsTime && !plannedTime) {
      showAlert(t('missing'), t('missingTime'));
      return;
    }
    if (!reason.trim()) {
      showAlert(t('missing'), t('missingReason'));
      return;
    }
    if (!user) return;

    setSubmitting(true);
    try {
      let uploaded:
        | { url: string; path: string; name: string }
        | undefined;
      if (type === 'sick' && attachment) {
        uploaded = await uploadHrAttachment(user.uid, attachment);
      }

      await submitRequest({
        type,
        startDate,
        endDate: needsRange ? endDate : startDate,
        reason: reason.trim(),
        plannedTime: needsTime ? plannedTime : undefined,
        minutes:
          type === 'early_leave' || type === 'late_arrive'
            ? minutes
              ? Number(minutes)
              : undefined
            : undefined,
        location: type === 'business_trip' ? location.trim() : undefined,
        attachmentUrl: uploaded?.url,
        attachmentName: uploaded?.name,
        attachmentPath: uploaded?.path,
      });
      setReason('');
      setPlannedTime('');
      setMinutes('');
      setLocation('');
      setAttachment(null);
      setStartDate('');
      setEndDate('');
      showAlert(t('submitted'), t('requestsSubmitted'));
      setTab('status');
    } catch (error: any) {
      showAlert(t('error'), error?.message || t('actionFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-surface-50">
      <View className="px-6 pt-12 pb-3 bg-white border-b border-surface-100">
        <Text className="text-2xl font-bold text-surface-800">{t('requestsTitle')}</Text>
        <Text className="text-surface-400 text-sm mt-1">
          {t('requestsVacationBalance')}: {remainingVacation} / {vacationAllowance} (
          {t('requestsUsed')} {usedVacationDays})
        </Text>

        <View className="mt-3 bg-primary-50 rounded-xl p-3 border border-primary-100">
          <Text className="text-xs font-bold text-primary-700 uppercase mb-1">
            {t('vacationBalanceDetails')}
          </Text>
          <Text className="text-sm text-surface-700">
            {t('vacationAllowanceLine', { days: vacationAllowance })}
          </Text>
          <Text className="text-sm text-surface-700">
            {t('vacationUsedLine', { days: usedVacationDays })}
          </Text>
          <Text className="text-sm font-semibold text-primary-700 mb-2">
            {t('vacationRemainingLine', { days: remainingVacation })}
          </Text>
          {myRequests
            .filter(
              (r) =>
                r.type === 'vacation' &&
                (r.startDate || '').startsWith(String(new Date().getFullYear())),
            )
            .slice(0, 8)
            .map((r) => (
              <Text key={r.id} className="text-[11px] text-surface-500 mb-0.5">
                {r.startDate}
                {r.endDate && r.endDate !== r.startDate ? ` → ${r.endDate}` : ''} · {r.days || 0}{' '}
                {t('days')} · {r.status}
              </Text>
            ))}
        </View>

        <View className="flex-row mt-3 bg-surface-100 rounded-xl p-1">
          <TouchableOpacity
            onPress={() => setTab('new')}
            className={`flex-1 h-10 rounded-lg items-center justify-center ${
              tab === 'new' ? 'bg-white' : ''
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                tab === 'new' ? 'text-primary-500' : 'text-surface-500'
              }`}
            >
              {t('requestsNew')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('status')}
            className={`flex-1 h-10 rounded-lg items-center justify-center ${
              tab === 'status' ? 'bg-white' : ''
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                tab === 'status' ? 'text-primary-500' : 'text-surface-500'
              }`}
            >
              {t('requestsStatus')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {tab === 'status' ? (
        <RequestDashboard
          mode="staff"
          requests={myRequests}
          isLoading={isLoading}
          onRefresh={refreshMine}
          emptyLabel={t('requestsNoItems')}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refreshMine} />}
        >
          <View className="bg-white rounded-2xl p-4 mb-4">
            <Text className="font-semibold text-surface-800 mb-3">{t('requestsNew')}</Text>
            <View className="flex-row flex-wrap mb-3">
              {HR_REQUEST_TYPES.map((reqType) => (
                <TouchableOpacity
                  key={reqType}
                  onPress={() => {
                    setType(reqType);
                    if (!TIME_TYPES.includes(reqType)) setPlannedTime('');
                    if (reqType !== 'business_trip') setLocation('');
                    if (reqType !== 'sick') setAttachment(null);
                  }}
                  className={`mr-2 mb-2 px-3 py-2 rounded-full ${
                    type === reqType ? 'bg-primary-500' : 'bg-surface-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold capitalize ${
                      type === reqType ? 'text-white' : 'text-surface-600'
                    }`}
                  >
                    {t(requestTypeKey(reqType))}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <DateField
              label={needsRange ? t('startDate') : t('date')}
              value={startDate}
              onChange={(ymd) => {
                setStartDate(ymd);
                if (endDate && endDate < ymd) setEndDate('');
              }}
              placeholder={t('tapSelectDate')}
            />

            {needsRange && (
              <DateField
                label={t('endDate')}
                value={endDate}
                onChange={setEndDate}
                minimumDate={startDate || undefined}
                placeholder={t('tapSelectDate')}
              />
            )}

            {type === 'business_trip' && (
              <>
                <Text className="text-xs text-surface-400 mb-1">{t('location')}</Text>
                <TextInput
                  className="border border-surface-200 rounded-xl px-3 h-11 mb-3 text-surface-800"
                  value={location}
                  onChangeText={setLocation}
                  placeholder={t('businessLocation')}
                  placeholderTextColor="#CBD5E1"
                />
              </>
            )}

            {type === 'sick' && (
              <View className="mb-3">
                <Text className="text-xs text-surface-400 mb-1">{t('medicalDocument')}</Text>
                <TouchableOpacity
                  onPress={pickSickDocument}
                  className="border border-dashed border-surface-300 rounded-xl px-3 h-12 flex-row items-center justify-between bg-surface-50"
                >
                  <Text
                    className={`flex-1 mr-2 text-sm ${
                      attachment ? 'text-surface-800' : 'text-surface-400'
                    }`}
                    numberOfLines={1}
                  >
                    {attachment ? attachment.name : t('uploadFile')}
                  </Text>
                  <MaterialCommunityIcons
                    name={attachment ? 'file-check-outline' : 'upload-outline'}
                    size={22}
                    color="#1E3A5F"
                  />
                </TouchableOpacity>
                {!!attachment && (
                  <TouchableOpacity onPress={() => setAttachment(null)} className="mt-2">
                    <Text className="text-red-500 text-xs">{t('removeFile')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {needsTime && (
              <TimeField
                label={
                  type === 'early_leave'
                    ? t('leaveTime')
                    : type === 'late_arrive'
                      ? t('arriveTime')
                      : t('time')
                }
                value={plannedTime}
                onChange={setPlannedTime}
              />
            )}

            {(type === 'early_leave' || type === 'late_arrive') && (
              <>
                <Text className="text-xs text-surface-400 mb-1">
                  {t('minutes')} ({t('optional')})
                </Text>
                <TextInput
                  className="border border-surface-200 rounded-xl px-3 h-11 mb-3 text-surface-800"
                  value={minutes}
                  onChangeText={setMinutes}
                  keyboardType="numeric"
                  placeholder="30"
                  placeholderTextColor="#CBD5E1"
                />
              </>
            )}

            <Text className="text-xs text-surface-400 mb-1">{t('reason')}</Text>
            <TextInput
              className="border border-surface-200 rounded-xl px-3 h-20 mb-3 text-surface-800"
              value={reason}
              onChangeText={setReason}
              placeholder={t('shortReason')}
              placeholderTextColor="#CBD5E1"
              multiline
            />
            <TouchableOpacity
              onPress={onSubmit}
              disabled={submitting}
              className="bg-primary-500 rounded-xl h-12 items-center justify-center"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold">{t('requestsSubmit')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
