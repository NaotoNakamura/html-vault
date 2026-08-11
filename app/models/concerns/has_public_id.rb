module HasPublicId
  extend ActiveSupport::Concern

  included do
    before_validation :assign_public_id, on: :create
    validates :public_id, presence: true, uniqueness: true
  end

  private

  def assign_public_id
    self.public_id ||= loop do
      candidate = SecureRandom.alphanumeric(8)
      break candidate unless self.class.exists?(public_id: candidate)
    end
  end
end
