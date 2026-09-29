import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import {
  compliancePeriodLabel,
  isDateComplianceType,
  isMonthComplianceType,
  isTaxYearComplianceType,
  taxYearOptions,
} from '@/lib/compliancePeriod'

export function CompliancePeriodField({ compliancePeriodType, value, onChange, error, disabled }) {
  const label = compliancePeriodLabel(compliancePeriodType)

  if (!compliancePeriodType) {
    return (
      <FormField label="Compliance Period" htmlFor="compliancePeriodInput">
        <Input id="compliancePeriodInput" disabled placeholder="Select a service first…" />
      </FormField>
    )
  }

  if (isTaxYearComplianceType(compliancePeriodType)) {
    return (
      <FormField label={label} htmlFor="compliancePeriodInput" error={error}>
        <Select
          id="compliancePeriodInput"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">Select tax year…</option>
          {taxYearOptions().map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </FormField>
    )
  }

  if (isMonthComplianceType(compliancePeriodType)) {
    return (
      <FormField label={label} htmlFor="compliancePeriodInput" error={error}>
        <Input
          id="compliancePeriodInput"
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </FormField>
    )
  }

  return (
    <FormField label={label} htmlFor="compliancePeriodInput" error={error}>
      <Input
        id="compliancePeriodInput"
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </FormField>
  )
}
