class Bundle < ApplicationRecord
  include HasPublicId

  MAX_FILES = 20

  has_many :user_files, dependent: :destroy

  validates :title, presence: true
end
