class Bundle < ApplicationRecord
  MAX_FILES = 20

  has_many :user_files, dependent: :destroy

  before_validation :assign_public_id, on: :create

  validates :public_id, presence: true, uniqueness: true
  validates :title, presence: true

  private

  def assign_public_id
    self.public_id ||= loop do
      candidate = SecureRandom.alphanumeric(8)
      break candidate unless Bundle.exists?(public_id: candidate)
    end
  end
end
