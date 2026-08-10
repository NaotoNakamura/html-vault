class UserFile < ApplicationRecord
  ALLOWED_EXTENSIONS = %w[html js css json svg].freeze
  MAX_FILE_SIZE = 10.megabytes

  has_one_attached :file

  before_validation :assign_public_id, on: :create

  validates :public_id, presence: true, uniqueness: true
  validates :filename, presence: true
  validates :title, presence: true
  validates :file_type, presence: true, inclusion: { in: ALLOWED_EXTENSIONS }
  validate :file_attached
  validate :file_extension_allowed
  validate :file_size_within_limit

  def content_type
    case file_type
    when "html" then "text/html; charset=utf-8"
    when "js" then "application/javascript; charset=utf-8"
    when "css" then "text/css; charset=utf-8"
    when "json" then "application/json; charset=utf-8"
    when "svg" then "image/svg+xml"
    else "application/octet-stream"
    end
  end

  private

  def assign_public_id
    self.public_id ||= loop do
      candidate = SecureRandom.alphanumeric(8)
      break candidate unless UserFile.exists?(public_id: candidate)
    end
  end

  def file_attached
    errors.add(:file, "must be attached") unless file.attached?
  end

  def file_extension_allowed
    return unless file.attached?

    extension = file.filename.extension_without_delimiter.downcase
    errors.add(:file, "extension .#{extension} is not allowed") unless ALLOWED_EXTENSIONS.include?(extension)
  end

  def file_size_within_limit
    return unless file.attached?

    errors.add(:file, "is too large (max #{MAX_FILE_SIZE / 1.megabyte}MB)") if file.byte_size > MAX_FILE_SIZE
  end
end
